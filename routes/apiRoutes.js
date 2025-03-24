const express = require('express');
const axios = require('axios');
const db = require('../config/db');
const { authenticateJWT } = require('../utils/utils');
const {decryptData} = require('../utils/encryptData')
const path = require("path");
const fs = require("fs");
const multer = require ("multer");

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


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/";
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}${ext}`;
    cb(null, filename);
  },
});

const upload = multer({ storage });

router.post("/upload", authenticateJWT, upload.single("video"), (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "userId не передан!" });

  db.query("SELECT is_premium FROM users WHERE userId = ?", [userId], (err, results) => {
    if (err) {
      console.error("Ошибка БД:", err);
      return res.status(500).json({ error: "Ошибка сервера" });
    }

    if (results.length === 0) return res.status(404).json({ error: "Пользователь не найден!" });

    if (!req.file) return res.status(400).json({ error: "Файл не загружен!" });

    const videoUrl = `${process.env.SERVER_URL}/uploads/${req.file.filename}`;
    res.json({ videoUrl });
  });
});

router.get("/video/:filename", authenticateJWT, (req, res) => {
  const { filename } = req.params;
  const filePath = path.resolve(__dirname, "..", "uploads", filename);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      return res.status(404).json({ error: "Видео не найдено!" });
    }

    const fileSize = stats.size;
    const range = req.headers.range;

    if (!range) {
      return res.status(400).send("Требуется заголовок Range для стриминга!");
    }

    const [start, end] = range.replace(/bytes=/, "").split("-").map(Number);
    const chunkStart = start || 0;
    const chunkEnd = end ? Math.min(end, fileSize - 1) : fileSize - 1;

    res.status(206);
    res.setHeader("Content-Range", `bytes ${chunkStart}-${chunkEnd}/${fileSize}`);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Length", chunkEnd - chunkStart + 1);
    res.setHeader("Content-Type", "video/mp4");

    const stream = fs.createReadStream(filePath, { start: chunkStart, end: chunkEnd });
    stream.pipe(res);
  });
});

router.delete("/delete/:filename", authenticateJWT, (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, "..", "uploads", filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Файл не найден" });
  }

  fs.unlink(filePath, (err) => {
    if (err) {
      console.error("Ошибка при удалении файла:", err);
      return res.status(500).json({ error: "Ошибка при удалении файла" });
    }

    res.json({ message: "Файл успешно удалён" });
  });
});

router.post('/sell-gift', (req, res) => {
  const { userId, giftId } = req.body;

  if (!userId || !giftId) {
    return res.status(400).json({ error: 'Необходимо указать userId и giftId' });
  }

  const getGiftQuery = 'SELECT * FROM users WHERE userId = ?';
  db.query(getGiftQuery, [userId], (err, userResults) => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка при получении данных пользователя' });
    }

    const user = userResults[0];

    let gifts = [];
    try {
      
      gifts = JSON.parse(user.gifts);
    } catch (error) {
      return res.status(500).json({ error: 'Ошибка при парсинге данных о подарках' });
    }

    const gift = gifts.find(g => g.id === giftId);

    if (!gift) {
      return res.status(404).json({ error: 'Подарок не найден' });
    }

    if (gift.is_selled) {
      return res.status(400).json({ error: 'Подарок уже продан' });
    }

    
    if (!gift.hasOwnProperty('is_selled')) {
      gift.is_selled = false; 
    }

    const discountPrice = Math.round(gift.price * 0.8);  

    const updatePointsQuery = 'UPDATE users SET points = points + ? WHERE userId = ?';
    db.query(updatePointsQuery, [discountPrice, userId], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Ошибка при обновлении очков пользователя' });
      }

    
      const giftIndex = gifts.findIndex(g => g.id === giftId);

  
      gifts[giftIndex].is_selled = true;

     
      const updateGiftQuery = 'UPDATE users SET gifts = ? WHERE userId = ?';
      db.query(updateGiftQuery, [JSON.stringify(gifts), userId], (err) => {
        if (err) {
          return res.status(500).json({ error: 'Ошибка при обновлении статуса подарка' });
        }

        res.status(200).json({ message: 'Подарок успешно продан', pointsAdded: discountPrice });
      });
    });
  });
});


module.exports = router;