#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const qiniu = require('qiniu');
const minimist = require('minimist');
const dotenv = require('dotenv');

async function main() {
  const argv = minimist(process.argv.slice(2));
  const config = await loadConfig();

  if (!config) {
    await promptForConfig();
    return;
  }

  const { ACCESS_KEY, SECRET_KEY, BUCKET, URL } = config;

  const fileName = argv._[0];
  if (!fileName || !fileName.endsWith('.md')) {
    console.log('Please provide a valid Markdown file path.');
    return;
  }

  const mdPath = path.resolve(process.cwd(), fileName);
  if (!await fileExists(mdPath)) {
    console.log(`File: ${fileName} does not exist!`);
    return;
  }

  const mdContent = await fs.readFile(mdPath, 'utf-8');
  const imgUrls = extractImageUrls(mdContent);

  console.log('Image URLs:', imgUrls);

  const qiniuUploader = createQiniuUploader(ACCESS_KEY, SECRET_KEY, BUCKET);
  const updatedContent = await processImages(mdContent, imgUrls, URL, qiniuUploader);

  await fs.writeFile(mdPath, updatedContent, 'utf-8');
  console.log('All images have been uploaded and links have been replaced.');
}

async function loadConfig() {
  const dirPath = path.resolve(__dirname, '.env');
  const mdprConfigPath = path.resolve(process.env.HOME, '.mdpr');

  if (await fileExists(dirPath)) {
    dotenv.config({ path: dirPath });
    return process.env;
  } else if (await fileExists(mdprConfigPath)) {
    return require(mdprConfigPath);
  }

  return null;
}

async function promptForConfig() {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const config = {};
  const questions = ['ACCESS_KEY', 'SECRET_KEY', 'BUCKET', 'URL'];

  for (const question of questions) {
    config[question] = await new Promise(resolve => {
      readline.question(`Please enter ${question}: `, resolve);
    });
  }

  readline.close();

  const mdprConfigPath = path.resolve(process.env.HOME, '.mdpr');
  await fs.writeFile(mdprConfigPath, JSON.stringify(config));
  console.log('Configuration saved.');
}

function extractImageUrls(content) {
  const regex = /!\[.*?\]\((.*?)\)/g;
  return Array.from(content.matchAll(regex), match => match[1]);
}

function createQiniuUploader(accessKey, secretKey, bucket) {
  const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
  const putPolicy = new qiniu.rs.PutPolicy({ scope: bucket });
  const uploadToken = putPolicy.uploadToken(mac);
  const config = new qiniu.conf.Config();
  const formUploader = new qiniu.form_up.FormUploader(config);
  const putExtra = new qiniu.form_up.PutExtra();

  return async function uploadToQiniu(filePath, key) {
    return new Promise((resolve, reject) => {
      formUploader.putFile(uploadToken, key, filePath, putExtra, (err, body, info) => {
        if (err) reject(err);
        else resolve(body);
      });
    });
  };
}

async function processImages(content, imgUrls, urlPrefix, uploader) {
  const tempDir = path.resolve('./cacheImgs');
  await fs.mkdir(tempDir, { recursive: true });

  for (const imgUrl of imgUrls) {
    const fileName = path.basename(imgUrl);
    const filePath = path.join(tempDir, fileName);

    try {
      await downloadImage(imgUrl, filePath);
      const result = await uploader(filePath, fileName);
      const newImgUrl = `${urlPrefix}/${result.key}`;
      content = content.replace(imgUrl, newImgUrl);
    } catch (error) {
      console.error(`Error processing ${imgUrl}:`, error.message);
    }
  }

  return content;
}

async function downloadImage(url, filePath) {
  const response = await axios({
    url,
    responseType: 'stream',
    timeout: 5000
  });

  const writer = fs.createWriteStream(filePath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

main().catch(console.error);