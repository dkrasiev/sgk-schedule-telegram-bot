require("dotenv").config();

const mongoose = require("mongoose");
const bot = require("./bot");

const chatService = require("./services/chat.service");

const start = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    await chatService.fetchGroups();
    await chatService.checkSchedule();

    setInterval(chatService.checkSchedule, 1800 * 1000);

    bot.on("text", require("./middlewares/log.middleware"));
    bot.use(require("./middlewares/chat.middleware"));
    bot.use(require("./composers/main.composer"));

    bot.on("message", async (ctx, next) => {
      if (ctx.chat.type === "private") await ctx.reply("Я тебя не понимаю");

      next();
    });

    // Enable graceful stop
    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  } catch (error) {
    console.log(error);
  }
};

start();
