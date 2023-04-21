#!/usr
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const qiniu = require('qiniu');
const argv = require('minimist')(process.argv.slice(2))

const {
  ACCESS_KEY,
  SECRET_KEY,
  BUCKET,
  URL
} = process.env;

if (!(ACCESS_KEY && SECRET_KEY &&BUCKET&& URL)) {
  console.log('请检查环境变量是否正确')
  return;
}

let fileName = argv._[0]
if (!(argv._.length  && fileName.indexOf('.md')>-1)) {
  console.log('检查文件路径是否正确!')
  return
}

// 读取Markdown文件内容
const mdPath = process.cwd()+'/'+fileName;


if (!fs.existsSync(mdPath)) {
  console.log(`文件: ${fileName} 不存在!`);
  return;
}

let mdContent = fs.readFileSync(mdPath, 'utf-8');

// 匹配Markdown中的图片链接
const imgReg = /\!\[.*?\]\((.*?)\)/g;
const regex = /\!\[[^\]]*\]\(([^)]+)\)/g;
let imgUrls = mdContent.match(imgReg);

imgUrls = imgUrls.map((imgUrl) => {
  return imgUrl.replace(regex, (match, p1) => {
    return p1
  })
})

console.log(`imgUrls`, imgUrls);

const accessKey =  ACCESS_KEY
const secretKey =  SECRET_KEY
const bucket =  BUCKET
const urlPrefix = URL

const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
const options = {
  scope: bucket,
};
const putPolicy = new qiniu.rs.PutPolicy(options);
const uploadToken = putPolicy.uploadToken(mac);
const config = new qiniu.conf.Config();
const formUploader = new qiniu.form_up.FormUploader(config);
const putExtra = new qiniu.form_up.PutExtra();
const maxTime = 5000;


const tempDir = './cacheImgs';
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}


function start() {
  // 遍历图片链接，下载图片并上传到七牛云存储
  Promise.all(
    imgUrls.map((imgUrl) => {
      const fileName = path.basename(imgUrl);
      const filePath = path.join('images', fileName);
      return Promise.race([
        new Promise((resolve, reject) => {

          const timeout = setTimeout(() => {
            clearTimeout(timeout);
            console.log(`Image ${imgUrl} download timeout.`);
            resolve();
          }, 5000);

          axios({
            url: imgUrl,
            responseType: 'stream',
          }).then((response) => {
            response.data
              .pipe(fs.createWriteStream(filePath))
              .on('finish', () => {
                clearTimeout(timeout);
                formUploader.putFile(uploadToken, fileName, filePath, putExtra, (err, body, info) => {
                  if (err) {
                    reject(err);
                  } else {
                    const imgLink = `${urlPrefix}/${body.key}`;
                    mdContent = mdContent.replace(imgUrl, imgLink);
                    resolve();
                  }
                });
              })
              .on('error', (err) => {
                reject(err);
              });
          }).catch((err) => {
            clearTimeout(timeout);
            console.log(`Image ${imgUrl} download error: ${err}`);
            resolve();
          });
        }),

        new Promise((resolve) => setTimeout(() => resolve(), 5000))
      ]);
    })
  ).then(() => {
    fs.writeFileSync(mdPath, mdContent, 'utf-8');
    console.log('All images have been uploaded and links have been replaced.');
  }).catch((err) => {
    console.error(err);
  });
}
start()