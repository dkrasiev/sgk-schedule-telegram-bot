const dayjs = require("dayjs");
const { default: axios } = require("axios");
const chats = require("../models/chat.model");
const groups = require("../models/group.model");
const getNextWorkDate = require("../helpers/getNextWorkDate");
const { SCHEDULE_API, GROUPS_API } = require("../helpers/api");
const bot = require("../bot");
const { getMessageSchedule } = require("../helpers/messageGenerator");

class ChatService {
  async startSubscription(chatId, groupId) {
    const dateNext = getNextWorkDate(getNextWorkDate(dayjs().add(1, "day")));
    const currentSchedule = (
      await axios.get(
        SCHEDULE_API + "/" + groupId + "/" + dateNext.format("YYYY-MM-DD")
      )
    ).data;
    const chat = await chats.findOne({ chatId });

    chat.subscription = {
      groupId,
      lastSchedule: currentSchedule,
    };

    await chat.save();
  }

  async stopSubscription(chatId) {
    const chat = await chats.find({ id: chatId });

    if (!chat.subscription?.groupId) {
      return false;
    }

    delete chat.subscription;
    await chat.save();

    return true;
  }

  async getGroupFromMessage(message) {
    const regex = new RegExp(/[А-я]{1,3}[\W]?\d{2}[\W]?\d{2}/g);
    const regexResult = regex.exec(message);
    const groupName = regexResult
      ? regexResult[0].replaceAll("-", "").replaceAll(" ", "").toLowerCase()
      : "";

    const group = (await groups.find()).find(
      (group) => group.name.toLowerCase().replaceAll("-", "") === groupName
    );

    return group;
  }

  async getGroupByChatId(chatId) {
    const chat = await chats.findOne({ id: chatId });

    const group = await groups.findOne({ id: chat?.defaultGroup });

    return group;
  }

  async checkSchedule() {
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
      const schedule = await this.getSchedule(groupId, dateNext);

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
        !this.compareSchedule(lastSchedule, newSchedule) &&
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

  async sendSchedule(ctx, chat, group) {
    if (!chat) {
      chat = await chats.findOne({ id: ctx.chat.id });
    }

    if (!group) {
      group = await groups.findOne({ id: chat.defaultGroup });
    }

    const currentDate = dayjs();
    const firstDate = getNextWorkDate(currentDate);
    const secondDate = getNextWorkDate(firstDate.add(1, "day"));

    const scheduleToday = await this.getSchedule(group.id, firstDate);
    const scheduleNext = await this.getSchedule(group.id, secondDate);

    await ctx.reply(await getMessageSchedule(scheduleToday, group));
    await ctx.reply(await getMessageSchedule(scheduleNext, group));
  }

  async getSchedule(groupId, date) {
    const url = SCHEDULE_API + `/${groupId}/${date.format("YYYY-MM-DD")}`;
    const schedule = (await axios.get(url)).data;

    return schedule;
  }

  async fetchGroups() {
    const fetchedGroups = (await axios.get(GROUPS_API)).data.filter(
      (group) => group.name !== "--"
    );

    if (fetchedGroups?.length) {
      await groups.deleteMany();
      await groups.insertMany(fetchedGroups);
    }
  }

  compareSchedule(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
}

module.exports = new ChatService();
