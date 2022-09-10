const TelegramApi = require("node-telegram-bot-api");
const dayjs = require("dayjs");
const axios = require("axios").default;
const { MongoClient, ServerApiVersion } = require("mongodb");

require("dotenv").config();

const client = new MongoClient(process.env.MONGODB_URI, {
	useNewUrlParser: true,
	useUnifiedTopology: true,
	serverApi: ServerApiVersion.v1,
});

client.connect();

const scheduleApi = "https://asu.samgk.ru/api/schedule/";
const groupsApi = "https://mfc.samgk.ru/api/groups";

const token =
	process.env.ENV_MODE === "dev"
		? process.env.TEST_TOKEN_BOT
		: process.env.TOKEN_BOT;
if (!token) {
	console.log("No token finded!");
	process.exit();
}
const bot = new TelegramApi(token, { polling: true });

let groups = [];

async function checkSchedule() {
	const chats = await client.db().collection("chats").find().toArray();
	const chatsWithSubscription = chats.filter((chat) => chat.subscription);
	const groupIds = new Set(
		chatsWithSubscription.map((chat) => chat.subscription.groupId)
	);

	const schedules = {};
	for (const groupId of groupIds) {
		const dateNext = getDateFrom(dayjs().add(1, "day"));
		const schedule = await getSchedule(groupId, dateNext);

		schedules[groupId] = schedule;
	}

	for (const chat of chatsWithSubscription) {
		const newSchedule = schedules[chat.subscription.groupId];
		const { lastSchedule } = chat.subscription;

		const isScheduleNew =
			!compareSchedule(lastSchedule, newSchedule) && newSchedule;
		const group = groups.find(
			(group) => group.id === chat.subscription.groupId
		);

		if (isScheduleNew) {
			chat.subscription.lastSchedule = newSchedule;
			await saveChatSettings(chat.chatId, { subscription: chat.subscription });
			await bot.sendMessage(chat.chatId, "Вышло новое расписание!");
			await bot.sendMessage(
				chat.chatId,
				getMessageSchedule(newSchedule, group)
			);
		}
	}
}
setInterval(checkSchedule, 1800 * 1000);

checkSchedule();
fetchGroups();

bot.setMyCommands([
	{ command: "/help", description: "Показать помощь" },
	{ command: "/groups", description: "Показать все существующие группы" },
	{ command: "/schedule", description: "Показать расписание" },
	{ command: "/setgroup", description: "Изменить расписание по-умолчанию" },
	{ command: "/subscribe", description: "Подписаться на рассылку расписания" },
	{ command: "/unsubscribe", description: "Отписаться от рассылки расписания" },
]);

bot.onText(/\/help/, async (msg) => {
	bot.sendMessage(msg.chat.id, await getHelpMessage(msg.chat.id));
});

bot.onText(/(\/schedule|расписание)/, async (msg) => {
	const group =
		getGroupFromMessage(msg.text) || (await getGroupFromChat(msg.chat.id));

	if (!group) {
		bot.sendMessage(msg.chat.id, "Группа не найдена");
		return;
	}

	sendSchedule(msg.chat.id, group);
});

bot.onText(/\/groups/, async (msg) => {
	await bot.sendMessage(msg.chat.id, getMessageAllGroups());
});

bot.onText(/\/start/, async (msg) => {
	await bot.sendMessage(msg.chat.id, `Привет, ${msg.from.first_name}`);
	await bot.sendMessage(
		msg.chat.id,
		"Чтобы узнать как я работаю, введи команду /help"
	);
});

bot.onText(/\/subscribe/, async (msg) => {
	const group =
		getGroupFromMessage(msg.text) || (await getGroupFromChat(msg.chat.id));

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
		`Вы подписались на рассылку расписания группы ${group.name}`
	);
});

bot.onText(/\/unsubscribe/, async (msg) => {
	if (await stopSubscription(msg.chat.id)) {
		bot.sendMessage(msg.chat.id, "Вы отписались от рассылки расписания");
	} else {
		bot.sendMessage(msg.chat.id, "Вы не подписаны на рассылку расписания");
	}
});

bot.onText(/\/setgroup/, async (msg) => {
	const group = getGroupFromMessage(msg.text);

	if (!group) {
		bot.sendMessage(msg.chat.id, "Группа не найдена или вы ничего не ввели");
		return;
	}

	await saveChatSettings(msg.chat.id, { defaultGroup: group.name });

	await bot.sendMessage(
		msg.chat.id,
		`Группа ${group.name} успешно установлена`
	);
});

bot.on("message", async (msg) => {
	if (!msg.text) return;

	console.log(msg.text);

	if (msg.chat.type === "private") {
		const group = await getGroupFromMessage(msg.text);

		if (group) {
			await sendSchedule(msg.chat.id, group);
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

	let message = `${group?.name}\n${schedule.date}\n\n`;

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

async function sendSchedule(chatId, group) {
	const currentDate = dayjs();

	const firstDate = getDateFrom(currentDate);
	const secondDate = getDateFrom(firstDate.add(1, "day"));

	const scheduleToday = await getSchedule(group.id, firstDate);
	const scheduleNext = await getSchedule(group.id, secondDate);

	await bot.sendMessage(chatId, getMessageSchedule(scheduleToday, group));
	await bot.sendMessage(chatId, getMessageSchedule(scheduleNext, group));
}

function getGroupFromMessage(message) {
	const regexArr = message.match(/[А-я]{2,3}[\W]?\d{2}[\W]?\d{2}/g);
	const groupName = regexArr
		? regexArr[0].replaceAll("-", "").replaceAll(" ", "").toLowerCase()
		: "";

	const group = groups?.find(
		(group) => group.name.toLowerCase().replaceAll("-", "") === groupName
	);

	return group;
}

async function saveChatSettings(chatId, settings) {
	if (!chatId) return;

	chatId = chatId.toString();
	const collection = client.db().collection("chats");
	const chatSettings = await collection.findOne({ chatId });

	if (settings) {
		const newChatSettings = { chatId, ...chatSettings, ...settings };
		await collection.replaceOne({ chatId }, newChatSettings, { upsert: true });
	}
}

async function getGroupFromChat(chatId) {
	if (!chatId) return;

	chatId = chatId.toString();
	let group = null;
	const chat = await getChatSettings(chatId);

	if (chat) {
		const groupName = chat.defaultGroup;
		group = groups.find((group) => group.name === groupName);
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
	const url = `${scheduleApi + groupId}/${date.format("YYYY-MM-DD")}`;
	const schedule = (await axios.get(url)).data;

	if (schedule) {
		return schedule;
	}
}

async function getHelpMessage(chatId) {
	const defaultGroup = await getGroupFromChat(chatId);

	let message =
		"Для получения расписания напишите:" +
		"\nрасписание <номер группы>" +
		"\n\nПример номера группы: ис-19-04, ис1904, ис 19 04\n";

	message += defaultGroup
		? `По-умолчанию выбрана группа ${defaultGroup.name}`
		: "Группа по-умолчанию не выбрана. " + "Чтобы установить группу введите \"/setgroup <номер группы>\"";

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
	const groupsData = (await axios.get(groupsApi)).data;

	groups = groupsData
		.sort((a, b) => a.name.localeCompare(b.name))
		.filter((group) => group.name !== "--");
}

async function startSubscription(chatId, groupId) {
	const dateNext = getDateFrom(getDateFrom(dayjs().add(1, "day")));
	const currentSchedule = await getSchedule(groupId, dateNext);

	const subscription = {
		groupId,
		lastSchedule: currentSchedule,
	};

	saveChatSettings(chatId, { subscription });
}

async function stopSubscription(chatId) {
	if (!chatId) return;

	chatId = chatId.toString();

	const chatSettings = await getChatSettings(chatId);

	if (!chatSettings?.subscription?.groupId) {
		return false;
	}

	await saveChatSettings(chatId, { subscription: null });

	return true;
}

async function getChatSettings(chatId) {
	if (!chatId) return;

	chatId = chatId.toString();
	const collection = client.db().collection("chats");
	const chat = await collection.findOne({ chatId });

	return chat;
}

function compareSchedule(a, b) {
	return JSON.stringify(a) === JSON.stringify(b);
}
