const crypto = require('crypto');

const encryptData = (data, secretKey) => {
  const iv = crypto.randomBytes(16); 
  const key = crypto.createHash('sha256').update(secretKey).digest(); 

  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
  encrypted += cipher.final('base64');

  return iv.toString('base64') + ":" + encrypted; 
};

const decryptData = (encryptedData, secretKey) => {
  try {
    const { iv, encryptedData: cipherText } = JSON.parse(encryptedData);
    const ivBuffer = Buffer.from(iv, "base64");
    const key = Buffer.from(secretKey.padEnd(32, " "), "utf-8"); 

    const decipher = crypto.createDecipheriv("aes-256-cbc", key, ivBuffer);
    let decrypted = decipher.update(cipherText, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return JSON.parse(decrypted);
  } catch (error) {
    console.error("Ошибка расшифровки данных на сервере:", error);
    return null;
  }
};
module.exports = { encryptData,decryptData };