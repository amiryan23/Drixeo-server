const express = require('express');
const axios = require('axios');
const db = require('../config/db');
const { authenticateJWT } = require('../utils/utils');
const {decryptData} = require('../utils/encryptData')

const router = express.Router();


router.post('/create-invoice', authenticateJWT , async (req, res) => {
  let { months, price } = req.body;

  months = Number(months);
  price = Number(price);

  const validPrices = {
    1: [350, 175],
    3: [1000, 500] 
  };


  if (![1, 3].includes(months)) {
    return res.status(400).json({ error: 'Некорректное значение месяцев. Допустимо только 1 или 3.' });
  }

  if (!validPrices[months].includes(price)) {
    return res.status(400).json({ error: 'Некорректная цена для указанного количества месяцев.' });
  }

  try {
    const invoiceData = {
      title: `Premium for ${months} month(s)`,
      description: `Покупка Premium подписки на ${months} месяц(ев).`,
      payload: JSON.stringify({ months }),
      provider_token: '' , 
      currency: 'XTR',
      prices: [{ label: `Premium for ${months} month(s)`, amount: price }],
    };

    const response = await axios.post(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/createInvoiceLink`,
      invoiceData
    );

    if (response.data.ok) {
      const invoiceLink = response.data.result;
      return res.json({ invoiceLink });
    } else {
      console.error('Ошибка от Telegram API:', response.data);
      return res.status(500).json({ error: 'Не удалось создать счет-фактуру' });
    }
  } catch (error) {
    console.error('Ошибка при создании счета:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Ошибка при создании счета' });
  }
});


router.post('/create-gift-invoice', authenticateJWT, (req, res) => {
  const { encryptReceiverId, giftName, giftPrice } = req.body;

  const receiverId = decryptData(encryptReceiverId, process.env.SECRET_KEY_CODE);

  if (!giftName || !giftPrice || isNaN(giftPrice) || giftPrice <= 0) {
    return res.status(400).json({ error: 'Некорректное название или цена подарка.' });
  }

  db.query('SELECT price FROM gifts WHERE name = ?', [giftName], (err, results) => {
    if (err) {
      console.error('Ошибка при запросе к БД:', err);
      return res.status(500).json({ error: 'Ошибка сервера при проверке подарка.' });
    }

    if (results.length === 0 || results[0].price !== giftPrice) {
      return res.status(400).json({ error: 'Некорректное название или цена подарка.' });
    }

    const invoiceData = {
      title: `Gift ${giftName}`,
      description: `Покупка ${giftName}`,
      payload: JSON.stringify({ giftName }),
      provider_token: '', 
      currency: 'XTR',
      prices: [{ label: `Gift ${giftName}`, amount: giftPrice }],
    };

    axios
      .post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/createInvoiceLink`, invoiceData)
      .then((response) => {
        if (response.data.ok) {
          return res.json({ invoiceLink: response.data.result });
        } else {
          console.error('Ошибка от Telegram API:', response.data);
          return res.status(500).json({ error: 'Не удалось создать счет-фактуру' });
        }
      })
      .catch((error) => {
        console.error('Ошибка при создании счета:', error.response?.data || error.message);
        return res.status(500).json({ error: 'Ошибка при создании счета' });
      });
  });
});

router.post('/update-premium', authenticateJWT , async (req, res) => {
  const { userId, isPremium, months , price } = req.body;

  if (!userId || isPremium === undefined || months === undefined) {
    return res.status(400).json({ error: 'Некорректные данные.' });
  }

  try {

    const currentDate = new Date();

    const expirationDate = new Date(currentDate.setMonth(currentDate.getMonth() + months));

    const updateUserQuery = `
      UPDATE users
      SET is_premium = ?, premium_expires_at = ?
      WHERE userId = ?
    `;

    db.query(updateUserQuery, [isPremium, expirationDate.toISOString(), userId], (err, updateResult) => {
      if (err) {
        console.error('Ошибка обновления данных пользователя:', err);
        return res.status(500).json({ error: 'Ошибка при обновлении данных пользователя.' });
      }

      if (updateResult.affectedRows === 0) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      console.log(`Премиум подписка успешно обновлена для пользователя ${userId}.`);


      const insertPaymentQuery = `
        INSERT INTO payments (senderId, receiverId, giftName, forStars , currentTime )
        VALUES (?, ?, ?, ?, UTC_TIMESTAMP())
      `;

      const paymentData = [userId, userId, `Premium${months}`, price , currentUTC];

      db.query(insertPaymentQuery, paymentData, (paymentErr) => {
        if (paymentErr) {
          console.error('Ошибка сохранения платежа:', paymentErr);
          return res.status(500).json({ error: 'Ошибка при сохранении информации о платеже.' });
        }

        console.log(`Платёж успешно сохранён: пользователь ${userId} купил Premium${months} на ${months} месяц(ев).`);
        res.status(200).json({ success: true, message: 'Премиум подписка успешно обновлена и платёж зарегистрирован!' });
      });
    });
  } catch (error) {
    console.error('Ошибка при обработке запроса:', error);
    res.status(500).json({ error: 'Ошибка при обработке запроса.' });
  }
});


router.get('/gifts', authenticateJWT , (req, res) => {
  const query = 'SELECT * FROM gifts'; 

  db.query(query, (err, results) => {
    if (err) {
      console.error('Ошибка при получении подарков:', err);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }

    res.json(results);
  });
});


router.post('/update-gift-hidden', authenticateJWT , (req, res) => {
  const { giftId, hidden , userId } = req.body;

  if (!giftId) {
    return res.status(400).json({ error: 'Gift ID is required' });
  }

  db.query('SELECT * FROM users WHERE userId = ?', [userId], (err, results) => {
    if (err) {
      console.error('Ошибка при поиске пользователя с подарком:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = results[0];
    const gifts = JSON.parse(user.gifts || '[]'); 

    const giftIndex = gifts.findIndex(gift => gift.id === giftId);
    if (giftIndex === -1) {
      return res.status(404).json({ error: 'Gift not found' });
    }

    gifts[giftIndex].hidden = hidden;

    db.query('UPDATE users SET gifts = ? WHERE userId = ?', [JSON.stringify(gifts), user.userId], (updateErr) => {
      if (updateErr) {
        console.error('Ошибка при обновлении подарков:', updateErr);
        return res.status(500).json({ error: 'Error updating gift' });
      }

      res.json({ success: true, updatedGift: gifts[giftIndex] });
    });
  });
});



router.post("/get-sender-details", authenticateJWT , (req, res) => {
  const { encryptSenderId } = req.body;

  const senderId = decryptData(encryptSenderId,process.env.SECRET_KEY_CODE)

  if (!senderId) {
    return res.status(400).json({ error: "Sender ID is required" });
  }

  db.query("SELECT first_name, photo_url FROM users WHERE userId = ?", [senderId], (err, results) => {
    if (err) {
      console.error("Ошибка базы данных:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Sender not found" });
    }

    res.json({
      senderName: results[0].first_name,
      senderPhoto: results[0].photo_url,
    });
  });
});


router.get('/search', async (req, res) => {
  const { query } = req.query; 

  if (!query) {
    return res.status(400).json({ error: 'Пожалуйста, укажите поисковый запрос' });
  }

  try {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        q: query,
        maxResults:15,
        type: 'video',
        key: process.env.SECRET_KEY_YOUTUBE,
      }
    });

    res.json(response.data.items);
  } catch (error) {
    console.error('Ошибка при запросе к YouTube API:', error);
    res.status(500).json({ error: 'Ошибка при запросе к YouTube API' });
  }
});




module.exports = router;