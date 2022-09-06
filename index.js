const TelegramApi = require("node-telegram-bot-api");
const dayjs = require("dayjs");

const token = "5573955751:AAGSxf-p0pd8y_u39b-Hd_9-3RBz1cGTbXw";

const scheduleApi = "https://asu.samgk.ru//api/schedule/";
const groupsApi = "https://mfc.samgk.ru/api/groups";

const bot = new TelegramApi(token, { polling: true });

let groups = [];

fetch(groupsApi)
  .then((response) => response.json())
  .then((groupsResponse) => {
    groups = groupsResponse
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((group) => group.name != "--");
  });

bot.setMyCommands([
  // { command: "/start", description: "Включить меня" },
  { command: "/help", description: "Показать помощь" },
  { command: "/groups", description: "Показать все существующие группы" },
]);

bot.on("message", async (msg) => {
  if (!msg.text) return;

  log(msg);

  if (msg.text.startsWith("/start")) {
    await bot.sendMessage(msg.chat.id, `Привет, ${msg.from.first_name}`);
  } else if (msg.text.startsWith("/help")) {
    await bot.sendMessage(
      msg.chat.id,
      "Для получения расписания напишите: \nрасписание <номер группы>\nПример номера группы: ис-19-04, ис1904, ис 19 04"
    );
  } else if (
    msg.text.startsWith("/schedule") ||
    msg.text.toLowerCase().includes("расписание")
  ) {
    const group = getGroupFromMessage(msg.text);
    if (!group) {
      return await bot.sendMessage(msg.chat.id, "Группа не найдена");
    }

    const scheduleToday = await getSchedule(group, dayjs());
    const scheduleNext = await getSchedule(group, dayjs().add(1, "day"));

    await bot.sendMessage(
      msg.chat.id,
      getMessageSchedule(scheduleToday, group)
    );
    await bot.sendMessage(msg.chat.id, getMessageSchedule(scheduleNext, group));
  } else if (msg.text.startsWith("/groups")) {
    await bot.sendMessage(msg.chat.id, getMessageAllGroups());
  } else {
    if (msg.chat.type == "private")
      await bot.sendMessage(msg.chat.id, "Я тебя не понимаю");
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

function getGroupFromMessage(message) {
  const regexArr = message.match(/[А-я]{2,3}[\W]?\d{2}[\W]?\d{2}/g);
  const groupName = regexArr
    ? regexArr[0].replaceAll("-", "").replaceAll(" ", "").toLowerCase()
    : "";

  const group = groups?.find(
    (group) => group.name.toLowerCase().replaceAll("-", "") == groupName
  );

  if (!regexArr) {
    return groups.find((group) => group.name == "ИС-19-04");
  }

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

async function getSchedule(group, date) {
  console.log(date.day());
  switch (date.day()) {
    case 0:
      date = date.add(1, "day");
      break;
    case 6: {
      date = date.add(2, "day");
    }
  }

  const url = scheduleApi + group.id + "/" + date.format("YYYY-MM-DD");
  const schedule = await (await fetch(url)).json();

  console.log(url);

  if (schedule) {
    return schedule;
  }

  return;
}
