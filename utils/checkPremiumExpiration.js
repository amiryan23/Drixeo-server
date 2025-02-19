const checkPremiumExpiration = () => {

  const currentDate = new Date();

  const query = `SELECT userId, premium_expires_at FROM users WHERE is_premium = 1`;

  db.query(query, (err, result) => {
    if (err) {
      console.error('Ошибка при получении пользователей:', err);
      return;
    }

    result.forEach((user) => {
      const expirationDate = new Date(user.premium_expires_at);

      if (currentDate >= expirationDate) {
        
        const updateQuery = `
          UPDATE users
          SET is_premium = 0, premium_expires_at = NULL
          WHERE userId = ?
        `;
        
        db.query(updateQuery, [user.userId], (err, updateResult) => {
          if (err) {
            console.error(`Ошибка при обновлении статуса премиума для пользователя ${user.userId}:`, err);
            return;
          }

          console.log(`Премиум подписка для пользователя ${user.userId} была успешно отменена.`);
        });
      }
    });
  });
};

module.exports = checkPremiumExpiration;