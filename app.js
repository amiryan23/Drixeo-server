require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const authRoutes = require('./routes/authRoutes');
const roomRoutes = require('./routes/roomRoutes');
const tasksRoutes = require('./routes/tasksRoutes')
const db = require('./config/db');
const socketHandler = require('./socket');
const userSettingsRoute = require('./routes/userSettingsRoute');
const checkPremiumExpiration = require('./utils/checkPremiumExpiration')
const apiRoutes = require('./routes/apiRoutes');
const cron = require('node-cron');
const { Telegraf } = require("telegraf");

const app = express();

app.use(cors({
  origin: "https://drixeo.netlify.app", 
  methods: ["GET", "POST" , "PUT"],
}));
app.use(express.json());
const server = http.createServer(app);

socketHandler(server, db);

app.use('/auth', authRoutes);
app.use('/rooms', roomRoutes);
app.use('/user', userSettingsRoute);
app.use('/api', apiRoutes);
app.use("/tasks", tasksRoutes);


let bot = new Telegraf(process.env.BOT_TOKEN)

bot.command('start',async (ctx) => {
  await ctx.replyWithPhoto({ url: 'https://i.ibb.co/h1BkLcBC/IMG-7878.jpg' }, {
    caption: 'Hey there! 👋 Welcome to Drixeo – the ultimate place to watch videos together in real time! 🎬✨',
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Start', url: 'https://t.me/drixeo_bot/app' }],
        [{ text: 'Drixeo Channel', url: 'https://t.me/drixeo' }]
      ]
    }
  });
});



bot.on('pre_checkout_query', (ctx) => {
    ctx.answerPreCheckoutQuery(true)
})

bot.on('message', (ctx) => {
    if (ctx.update.message.successful_payment != undefined) {
        ctx.reply('Thanks for the purchase!')
    } else {

    }
})

bot.launch()
  .then(() => console.log('Бот запущен!'))
  .catch((error) => console.error('Ошибка при запуске бота:'));




cron.schedule('0 0 * * *', checkPremiumExpiration);

const PORT = process.env.PORT
server.listen(PORT,'0.0.0.0', () => {
  console.log(`Сервер запущен `);
});




