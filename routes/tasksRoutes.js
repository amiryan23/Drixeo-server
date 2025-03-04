const express = require("express");
const router = express.Router();
const db = require('../config/db');
const { authenticateJWT } = require('../utils/utils');


router.post("/", authenticateJWT , (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId обязателен" });

  db.query("SELECT * FROM tasks", (err, results) => {
    if (err) {
      console.error("Ошибка:", err);
      return res.status(500).json({ error: "Ошибка сервера" });
    }

    const formattedTasks = results.map((task) => {
      let completedUsers = [];
      try {
        completedUsers = JSON.parse(task.is_completed || "[]"); 
      } catch (e) {
        console.error("Ошибка парсинга JSON:", e);
      }

      return {
        id: task.id,
        description: task.description,
        imgUrl: task.imgUrl,
        link: task.link,
        reward: task.reward,
        type: task.type,
        ended: task.ended,
        is_completed: completedUsers.includes(userId),
      };
    });

    res.json(formattedTasks);
  });
});


router.post("/claim/:taskId", authenticateJWT , (req, res) => {
  const { taskId } = req.params;
  const { userId } = req.body;

  if (!userId || !taskId) return res.status(400).json({ error: "userId и taskId обязательны" });

  db.query("SELECT is_completed, reward FROM tasks WHERE id = ?", [taskId], (err, taskResults) => {
    if (err || taskResults.length === 0) {
      console.error("Ошибка при получении задания:", err);
      return res.status(500).json({ error: "Ошибка сервера или задание не найдено" });
    }

    let { is_completed, reward } = taskResults[0];
    let completedUsers = [];

    try {
      completedUsers = JSON.parse(is_completed || "[]"); 
    } catch (e) {
      console.error("Ошибка парсинга JSON:", e);
    }

    if (completedUsers.includes(userId)) {
      return res.status(400).json({ error: "Задание уже выполнено" });
    }

    completedUsers.push(userId);
    const updatedCompleted = JSON.stringify(completedUsers);

    db.query("UPDATE tasks SET is_completed = ? WHERE id = ?", [updatedCompleted, taskId], (updateErr) => {
      if (updateErr) {
        console.error("Ошибка при обновлении задания:", updateErr);
        return res.status(500).json({ error: "Ошибка обновления задания" });
      }

      db.query("SELECT points FROM users WHERE userId = ?", [userId], (userErr, userResults) => {
        if (userErr || userResults.length === 0) {
          console.error("Ошибка при получении пользователя:", userErr);
          return res.status(500).json({ error: "Ошибка сервера или пользователь не найден" });
        }

        let userPoints = userResults[0].points || 0;
        let newPoints = userPoints + reward;

        db.query("UPDATE users SET points = ? WHERE userId = ?", [newPoints, userId], (pointsErr) => {
          if (pointsErr) {
            console.error("Ошибка при обновлении points:", pointsErr);
            return res.status(500).json({ error: "Ошибка обновления points" });
          }

          res.json({ success: true, newPoints });
        });
      });
    });
  });
});

module.exports = router;