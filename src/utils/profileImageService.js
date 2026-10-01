const https = require('https');
const crypto = require('crypto');
const environment = require('../config/environment');

function configReady() {
  return Boolean(environment.cloudinaryCloudName && environment.cloudinaryApiKey && environment.cloudinaryApiSecret);
}

function signature(params) {
  const canonical = Object.keys(params)
    .filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(canonical + environment.cloudinaryApiSecret).digest('hex');
}

function multipartBody(fields, fileField, fileBuffer, filename, contentType='application/octet-stream') {
  const boundary = `----ACSolutions${crypto.randomBytes(12).toString('hex')}`;
  const chunks = [];
  for (const [key, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${String(value)}\r\n`));
  }
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`));
  chunks.push(fileBuffer);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

function request(hostname, path, method, body, headers={}) {
  return new Promise((resolve, reject) => {
    const req = https.request({hostname, path, method, headers:{...headers, 'Content-Length': body ? body.length : 0}}, res => {
      const chunks=[];
      res.on('data', c=>chunks.push(c));
      res.on('end',()=>{
        const text=Buffer.concat(chunks).toString('utf8');
        let data; try { data=JSON.parse(text); } catch { data={raw:text}; }
        if(res.statusCode>=200 && res.statusCode<300) return resolve(data);
        reject(new Error(`Cloudinary request failed (${res.statusCode}): ${data?.error?.message || text || res.statusMessage}`));
      });
    });
    req.on('error', reject);
    if(body) req.write(body);
    req.end();
  });
}

function mimeFor(ext) {
  const e=String(ext||'').toLowerCase();
  return e==='.png'?'image/png':e==='.webp'?'image/webp':'image/jpeg';
}

async function uploadProfileImage(buffer, ext, publicId) {
  if(!configReady()) {
    if(environment.isProduction) throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.');
    return null;
  }
  const timestamp=Math.floor(Date.now()/1000);
  const params={public_id:publicId,timestamp};
  const fields={...params,api_key:environment.cloudinaryApiKey,signature:signature(params)};
  const mp=multipartBody(fields,'file',buffer,`profile${String(ext||'.jpg')}`,mimeFor(ext));
  return request('api.cloudinary.com', `/v1_1/${encodeURIComponent(environment.cloudinaryCloudName)}/image/upload`, 'POST', mp.body, {'Content-Type':mp.contentType});
}

async function deleteProfileImage(publicId) {
  if(!publicId || !configReady()) return null;
  const timestamp=Math.floor(Date.now()/1000);
  const params={public_id:publicId,timestamp};
  const fields={...params,api_key:environment.cloudinaryApiKey,signature:signature(params)};
  const mp=multipartBody(fields,'_unused',Buffer.alloc(0),'empty.txt','text/plain');
  // Cloudinary destroy is form-encoded; build a small urlencoded body instead.
  const body=new URLSearchParams(fields).toString();
  return request('api.cloudinary.com', `/v1_1/${encodeURIComponent(environment.cloudinaryCloudName)}/image/destroy`, 'POST', Buffer.from(body), {'Content-Type':'application/x-www-form-urlencoded'});
}

module.exports={configReady,uploadProfileImage,deleteProfileImage};
