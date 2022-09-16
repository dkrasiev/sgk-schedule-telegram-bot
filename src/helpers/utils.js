const { default: axios } = require("axios");
const dayjs = require("dayjs");
const { chats, groups } = require("../models");
const { SCHEDULE_API, GROUPS_API } = require("./api");

async function sendSchedule(ctx, chat, group) {
  if (!chat) {
    chat = await chats.findOne({ id: ctx.chat.id });
  }

  if (!group) {
    group = await groups.findOne({ id: chat.defaultGroup });
  }

  const currentDate = dayjs();
  const firstDate = getNextWorkDate(currentDate);
  const secondDate = getNextWorkDate(firstDate.add(1, "day"));

  const scheduleToday = await getSchedule(group.id, firstDate);
  const scheduleNext = await getSchedule(group.id, secondDate);

  await ctx.reply(await getMessageSchedule(scheduleToday, group));
  await ctx.reply(await getMessageSchedule(scheduleNext, group));
}

async function getGroups() {
  const groups = (await axios.get(GROUPS_API)).data.filter(
    (group) => group.name !== "--"
  );

  return groups;
}

function getNextWorkDate(date) {
  switch (date.day()) {
    case 0:
      date = date.add(1, "day");
      break;
    case 6: {
      date = date.add(2, "day");
    }
  }

  return date;
}

async function getSchedule(groupId, date) {
  const url = SCHEDULE_API + `/${groupId}/${date.format("YYYY-MM-DD")}`;
  const schedule = (await axios.get(url)).data;

  return schedule;
}

async function getGroupFromMessage(message) {
  const regex = new RegExp(/[А-я]{1,3}[\W]?\d{2}[\W]?\d{2}/g);
  const regexResult = regex.exec(message);
  const groupName = regexResult
    ? regexResult[0].replaceAll("-", "").replaceAll(" ", "").toLowerCase()
    : "";
  const groupsArray = await groups.find();

  const group = groupsArray.find(
    (group) => group.name.toLowerCase().replaceAll("-", "") === groupName
  );

  return group;
}

async function getGroupByChatId(chatId) {
  const chat = await chats.findOne({ id: chatId });
  const group = await groups.findOne({ id: chat?.defaultGroup });

  return group;
}

function numToTime(num) {
  const times = {
    1: "08:25-10:00",
    2: "10:10-11:45",
    3: "12:15-13:50",
    4: "14:00-15:35",
    5: "15:45-17:20",
    6: "17:30-19:05",
    7: "19:15-20:50",
    1.1: "08:25-09:10",
    1.2: "09:15-10:00",
    2.1: "10:10-10:55",
    2.2: "11:00-11:45",
    3.1: "12:15-13:00",
    3.2: "13:05-13:50",
    4.1: "14:00-14:45",
    4.2: "14:50-15:35",
    5.1: "15:45-16:30",
    5.2: "16:35-17:20",
    6.1: "17:30-18:15",
    6.2: "18:20-19:05",
    7.1: "19:15-20:00",
    7.2: "20:05-20:50",
  };
  return times[num];
}

function compareSchedule(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function getMessageAllGroups() {
  return (await groups.find()).map((group) => group.name).join("\n");
}

async function getMessageSchedule(schedule, group) {
  let message = `${group.name}\n${schedule.date}\n\n`;

  if (schedule?.lessons?.length > 0) {
    for (const lesson of schedule.lessons) {
      message += `${lesson.num} ${numToTime(lesson.num)}\n${lesson.title}\n${
        lesson.teachername
      }\n${lesson.cab}\n\n`;
    }
  } else {
    message += "Расписания нет";
  }

  return message;
}

async function getHelpMessage(chatId) {
  const chat = await chats.findOne({ id: chatId });
  const defaultGroup = await groups.findOne({ id: chat.defaultGroup });

  let message =
    "Для получения расписания напишите:" +
    "\nрасписание <номер группы>" +
    "\n\nПример номера группы: ис-19-04, ис1904, ис 19 04\n";

  message += defaultGroup
    ? `По умолчанию выбрана группа ${defaultGroup.name}`
    : "Группа по умолчанию не выбрана. " +
      'Чтобы установить группу введите "/setgroup <номер группы>"';

  return message;
}

module.exports = {
  sendSchedule,
  getGroupFromMessage,
  getGroupByChatId,
  getNextWorkDate,
  getSchedule,
  numToTime,
  compareSchedule,
  getHelpMessage,
  getMessageAllGroups,
  getMessageSchedule,
  getGroups,
};
