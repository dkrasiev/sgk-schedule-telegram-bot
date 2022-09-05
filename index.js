const { group } = require("console");
const TelegramApi = require("node-telegram-bot-api");

const token = "5573955751:AAGSxf-p0pd8y_u39b-Hd_9-3RBz1cGTbXw";

const scheduleApi = "https://asu.samgk.ru//api/schedule/";
const groupsApi = "https://mfc.samgk.ru/api/groups";

const bot = new TelegramApi(token, { polling: true });

let groups = [];

fetch(groupsApi)
  .then((response) => response.json())
  .then((groupsResponse) => {
    groups = groupsResponse.sort((a, b) => a.name.localeCompare(b.name));
  });

bot.setMyCommands([
  { command: "/start", description: "Включить меня" },
  { command: "/help", description: "Показать помощь" },
  { command: "/groups", description: "Показать все существующие группы" },
  // { command: "/schedule", description: "Показать расписание на сегодня" },
]);

bot.on("message", async (msg) => {
  log(msg);

  if (msg.text?.startsWith("/start")) {
    await bot.sendMessage(msg.chat.id, `Привет, ${msg.from.first_name}`);
  } else if (msg.text?.startsWith("/help")) {
    await bot.sendMessage(
      msg.chat.id,
      "Для получения расписания напишите: \nрасписание <номер группы> <дата (по-умолчанию сегодня)>"
    );
  } else if (
    msg.text?.startsWith("/schedule") ||
    msg.text?.toLowerCase().includes("расписание")
  ) {
    const group = getGroupFromMessage(msg.text);

    if (group && group.id) {
      const url = scheduleApi + group.id + "/" + getDate();
      console.log(url);
      const schedule = await (await fetch(url)).json();

      if (schedule && schedule.lessons) {
        await bot.sendMessage(msg.chat.id, getMessageSchedule(schedule, group));
      } else {
        await bot.sendMessage(msg.chat.id, "Расписание не найдено");
      }
    } else {
      await bot.sendMessage(msg.chat.id, "Группа не найдена");
    }
  } else if (msg.text?.startsWith("/groups")) {
    bot.sendMessage(msg.chat.id, getMessageAllGroups());
  } else {
    if (msg.chat.type == "private")
      await bot.sendMessage(msg.chat.id, "Я тебя не понимаю");
  }
});

bot.on("new_chat_photo", (msg) => {
  bot.sendMessage(msg.chat.id, "nice chat photo 👍");
});

function getDate() {
  const currentDate = new Date();

  let year = currentDate.getFullYear().toString();

  let month = (currentDate.getMonth() + 1).toString();
  if (month.length == 1) {
    month = "0" + month;
  }

  let date = (currentDate.getDate() + 1).toString();
  if (date.length == 1) {
    date = "0" + date;
  }

  const result = `${year}-${month}-${date}`;

  return result;
}

function getMessageAllGroups() {
  return groups.map((group) => group.name).join("\n");
}

function getMessageSchedule(schedule, group) {
  let message = group?.name + "\n" + schedule.date + "\n\n";

  for (let lesson of schedule.lessons) {
    message +=
      lesson.num +
      " " +
      numToTime(lesson.num) +
      "\n" +
      lesson.title +
      "\n" +
      lesson.teachername +
      "\n\n";
  }

  return message;
}

function getGroupFromMessage(message) {
  const regexArr = message.match(/[А-я]{2,3}-?\d{2}-?\d{2}/g);
  const groupName = regexArr ? regexArr[0] : "";

  console.log(groupName);

  const group = groups?.find(
    (group) => group.name.toLowerCase() == groupName?.toLowerCase()
  );

  return group;
}

function log(message) {
  const title = message.chat.title;
  const username = message.from.last_name
    ? message.from.first_name + " " + message.from.last_name
    : message.from.first_name;
  const text = message.text;

  if (title) {
    console.log(`${title}, ${username}: ${text}`);
  } else {
    console.log(`${username}: ${text}`);
  }
}

function numToTime(num) {
  num = num.toString();
  const times = {
    1: " 08:25-10:00",
    2: " 10:10-11:45",
    3: " 12:15-13:50",
    4: " 14:00-15:35",
    5: " 15:45-17:20",
    6: " 17:30-19:05",
    7: " 19:15-20:50",
    1.1: " 08:25-09:10",
    1.2: " 09:15-10:00",
    2.1: " 10:10-10:55",
    2.2: " 11:00-11:45",
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
