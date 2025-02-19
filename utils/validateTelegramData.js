const crypto = require('crypto');

function validateTelegramData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  params.delete('hash');

  const dataCheckString = Array.from(params)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return receivedHash === calculatedHash;
}

module.exports = validateTelegramData;