require("dotenv").config();

const { default: axios } = require("axios");
const dayjs = require("dayjs");
const mongoose = require("mongoose");

const bot = require("./bot");
const { GROUPS_API } = require("./helpers/api");
const { groups, chats } = require("./models");
const {
  getNextWorkDate,
  getSchedule,
  compareSchedule,
  getMessageSchedule,
} = require("./helpers/utils");

const start = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    await fetchGroups();
    await checkSchedule();

    setInterval(checkSchedule, 1800 * 1000);

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

async function checkSchedule() {
  console.log(`[${dayjs().format("HH:mm")}] checking schedule...`);

  const allChats = await chats.find();
  const chatsWithSubscription = allChats.filter(
    (chat) => chat.subscription.groupId
  );
  const groupIds = new Set(
    chatsWithSubscription.map((chat) => chat.subscription.groupId)
  );

  const schedules = {};
  for (const groupId of groupIds) {
    const dateNext = getNextWorkDate(dayjs().add(1, "day"));
    const schedule = await getSchedule(groupId, dateNext);

    schedules[groupId] = schedule;
  }

  for (const chat of chatsWithSubscription) {
    const group = await groups.findOne({ id: chat.subscription.groupId });
    const newSchedule = schedules[chat.subscription.groupId];
    const lastSchedule = chat.toObject().subscription.lastSchedule;

    lastSchedule.lessons.forEach((lesson) => {
      delete lesson._id;
    });

    if (
      !compareSchedule(lastSchedule, newSchedule) &&
      newSchedule?.lessons?.length
    ) {
      chat.subscription.lastSchedule = newSchedule;
      await chat.save();

      const message = await getMessageSchedule(newSchedule, group);

      await bot.telegram.sendMessage(chat.id, "Вышло новое расписание!");
      await bot.telegram.sendMessage(chat.id, message);
    }
  }
}

async function fetchGroups() {
  const fetchedGroups = (await axios.get(GROUPS_API)).data.filter(
    (group) => group.name !== "--"
  );

  if (fetchedGroups?.length) {
    await groups.deleteMany();
    await groups.insertMany(fetchedGroups);
  }
}
