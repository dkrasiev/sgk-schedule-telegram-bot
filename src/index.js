const fs = require("fs/promises");
const path = require("path");
const TelegramApi = require("node-telegram-bot-api");
const dayjs = require("dayjs");

require("dotenv").config();

const scheduleApi = "https://asu.samgk.ru/api/schedule/";
const groupsApi = "https://mfc.samgk.ru/api/groups";

const token =
  process.env.ENV_MODE == "dev"
    ? process.env.TEST_TOKEN_BOT
    : process.env.TOKEN_BOT;
const bot = new TelegramApi(token, { polling: true });

console.log(
  process.env.ENV_MODE == "production" ? "production mode" : "dev mode"
);

const chatsPath = path.resolve(__dirname, "data", "chats.json");

fs.readFile(chatsPath).catch(() => {
  fs.writeFile(chatsPath, "{}");
});

let groups = [];
let intervals = {};
let chats = {};

async function activateSubscriptions() {
  Object.entries(chats).forEach(([id, settings]) => {
    if (settings?.subscription?.groupId) {
      setSubscriptionInterval(id, settings.subscription);
    }
  });
}

loadChatsSettings();

fetchGroups();

bot.setMyCommands([
  // { command: "/start", description: "Включить меня" },
  { command: "/help", description: "Показать помощь" },
  { command: "/groups", description: "Показать все существующие группы" },
  { command: "/schedule", description: "Показать расписание" },
  { command: "/setgroup", description: "Изменить расписание по-умолчанию" },
  { command: "/subscribe", description: "Подписаться на рассылку расписания" },
  { command: "/unsubscribe", description: "Отписаться от рассылки расписания" },
]);

bot.on("message", async (msg) => {
  if (!msg.text) return;

  log(msg);

  if (msg.text.startsWith("/start")) {
    await bot.sendMessage(msg.chat.id, `Привет, ${msg.from.first_name}`);

    await bot.sendMessage(
      msg.chat.id,
      "Чтобы узнать как я работаю, введи команду /help"
    );
  } else if (msg.text.startsWith("/help")) {
    await bot.sendMessage(msg.chat.id, getHelpMessage(msg.chat.id));
  } else if (msg.text.startsWith("/setgroup")) {
    const group = getGroupFromMessage(msg.text);

    if (!group) {
      bot.sendMessage(msg.chat.id, "Группа не найдена или вы ничего не ввели");
      return;
    }

    await saveChatSettings(msg.chat.id, { defaultGroup: group.name });

    await bot.sendMessage(
      msg.chat.id,
      "Группа " + group.name + " успешно установлена"
    );
  } else if (
    msg.text.startsWith("/schedule") ||
    msg.text.toLowerCase().includes("расписание")
  ) {
    const group =
      getGroupFromMessage(msg.text) || getGroupFromChat(msg.chat.id);
    if (!group) {
      return await bot.sendMessage(msg.chat.id, "Группа не найдена");
    }

    await sendSchedule(msg.chat.id, group);
  } else if (msg.text.startsWith("/groups")) {
    await bot.sendMessage(msg.chat.id, getMessageAllGroups());
  } else if (msg.text.startsWith("/subscribe")) {
    const group =
      getGroupFromMessage(msg.text) || getGroupFromChat(msg.chat.id);

    if (!group) {
      await bot.sendMessage(
        msg.chat.id,
        "Группа не найдена или вы ничего не ввели"
      );

      return;
    }

    stopSubscription(msg.chat.id);
    startSubscription(msg.chat.id, group.id);

    bot.sendMessage(
      msg.chat.id,
      "Вы подписались на рассылку расписания группы " + group.name
    );
  } else if (msg.text.startsWith("/unsubscribe")) {
    if (stopSubscription(msg.chat.id)) {
      bot.sendMessage(msg.chat.id, "Вы отписались от рассылки расписания");
    } else {
      bot.sendMessage(msg.chat.id, "Вы не подписаны на рассылку расписания");
    }
  } else {
    if (msg.chat.type == "private") {
      const group = getGroupFromMessage(msg.text);

      if (group) {
        await sendSchedule(msg.chat.id, group);
      } else {
        await bot.sendMessage(msg.chat.id, "Я тебя не понимаю");
      }
      return;
    }
  }
});

bot.on("new_chat_photo", (msg) => {
  bot.sendMessage(msg.chat.id, "nice chat photo 👍");
});

function getMessageAllGroups() {
  return groups.map((group) => group.name).join("\n");
}

function getMessageSchedule(schedule, group) {
  if (!schedule) return;

  let message = group?.name + "\n" + schedule.date + "\n\n";

  if (schedule.lessons.length > 0) {
    for (let lesson of schedule.lessons) {
      message +=
        lesson.num +
        " " +
        numToTime(lesson.num) +
        "\n" +
        lesson.title +
        "\n" +
        lesson.teachername +
        "\n" +
        lesson.cab +
        "\n\n";
    }
  } else {
    message += "Расписания нет";
  }

  return message;
}

async function sendSchedule(chatId, group) {
  const currentDate = dayjs();

  const firstDate = getDateFrom(currentDate);
  const secondDate = getDateFrom(firstDate.add(1, "day"));

  const scheduleToday = await getSchedule(group.id, firstDate);
  const scheduleNext = await getSchedule(group.id, secondDate);

  await bot.sendMessage(chatId, getMessageSchedule(scheduleToday, group));
  await bot.sendMessage(chatId, getMessageSchedule(scheduleNext, group));
}

async function loadChatsSettings() {
  const chatsData = JSON.parse(
    await fs.readFile(chatsPath, { encoding: "utf-8" })
  );

  chats = chatsData || {};

  await activateSubscriptions();
}

function getGroupFromMessage(message) {
  const regexArr = message.match(/[А-я]{2,3}[\W]?\d{2}[\W]?\d{2}/g);
  const groupName = regexArr
    ? regexArr[0].replaceAll("-", "").replaceAll(" ", "").toLowerCase()
    : "";

  const group = groups?.find(
    (group) => group.name.toLowerCase().replaceAll("-", "") == groupName
  );

  return group;
}

async function saveChatSettings(chatId, settings) {
  if (settings) {
    chats[chatId] = { ...chats[chatId], ...settings };
  }

  console.log(chatId, chats[chatId]);

  await fs.writeFile(chatsPath, JSON.stringify(chats, undefined, 2));
}

function log(message) {
  const title = message.chat.title;
  const username = message.from.username;
  const text = message.text;

  if (title) {
    console.log(`${title}, ${username}: ${text}`);
  } else {
    console.log(`${username}: ${text}`);
  }
}

function getGroupFromChat(chatId) {
  let group = null;

  if (chatId in chats) {
    const groupName = chats[chatId].defaultGroup;
    group = groups.find((group) => group.name == groupName);
  }

  return group;
}

function numToTime(num) {
  num = num.toString();
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

async function getSchedule(groupId, date) {
  const url = scheduleApi + groupId + "/" + date.format("YYYY-MM-DD");
  const schedule = await (await fetch(url)).json();

  if (schedule) {
    return schedule;
  }

  return;
}

function getHelpMessage(chatId) {
  const defaultGroup = getGroupFromChat(chatId);

  let message =
    "Для получения расписания напишите: \nрасписание <номер группы>\n\nПример номера группы: ис-19-04, ис1904, ис 19 04\n";

  message += defaultGroup
    ? "По-умолчанию выбрана группа " + defaultGroup.name
    : 'Группа по-умолчанию не выбрана. Чтобы установить группу введите "/setgroup <номер группы>"';

  return message;
}

function getDateFrom(date) {
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

async function fetchGroups() {
  const response = await fetch(groupsApi);
  const responseText = await response.text();
  const groupsData = JSON.parse(responseText);

  console.log(groupsData.length);

  groups = groupsData
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((group) => group.name != "--");
}

function startSubscription(chatId, groupId) {
  const subscription = {
    groupId,
    lastSchedule: null,
  };

  const dateNext = getDateFrom(dayjs().add(1, "day"));
  getSchedule(groupId, dateNext).then((schedule) => {
    subscription.lastSchedule = schedule;
    saveChatSettings(chatId);
  });

  chats[chatId].subscription = subscription;
  setSubscriptionInterval(chatId, subscription);

  saveChatSettings(chatId, { subscription });
}

function stopSubscription(chatId) {
  const chatSettings = chats[chatId];
  if (!chatSettings?.subscription?.groupId) {
    return false;
  }

  clearInterval(intervals[chatId]);
  delete intervals[chatId];

  delete chatSettings.subscription;
  saveChatSettings(chatId);

  return true;
}

function setSubscriptionInterval(chatId, subscription) {
  intervals[chatId] = setInterval(async () => {
    const dateNext = getDateFrom(dayjs().add(1, "day"));

    const group = groups.find((value) => value.id == subscription.groupId);

    const schedule = await getSchedule(group.id, dateNext);

    if (schedule.lessons.length == 0) return;
    if (!subscription.lastSchedule) {
      subscription.lastSchedule = schedule;
      return;
    }

    if (compareSchedule(subscription.lastSchedule, schedule)) {
      console.log(`Расписание для группы ${group.name} не изменилось`);
      return;
    }

    subscription.lastSchedule = schedule;

    saveChatSettings(chatId);

    await bot.sendMessage(chatId, "Вышло новое расписание!");
    await bot.sendMessage(chatId, getMessageSchedule(schedule, group));
  }, 1800 * 1000);

  console.log("Интервал создан");
}

function compareSchedule(a, b) {
  return JSON.stringify(a) == JSON.stringify(b);
}
