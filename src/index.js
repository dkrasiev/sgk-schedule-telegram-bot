const TelegramApi = require("node-telegram-bot-api");
const dayjs = require("dayjs");
const mongoose = require("mongoose");
const { default: axios } = require("axios");

const chats = require("./models/chat.model");
const groups = require("./models/group.model");

const getNextWorkDate = require("./helpers/getNextWorkDate");
const { GROUPS_API, SCHEDULE_API } = require("./helpers/api");
const {
	getMessageAllGroups,
	getMessageSchedule,
	getHelpMessage,
} = require("./helpers/messageGenerator");

const chatService = require("./services/chatService");

require("dotenv").config();

let token = process.env.TOKEN_BOT;
if (process.env.ENV_MODE === "dev") {
	token = process.env.TEST_TOKEN_BOT;
}

const bot = new TelegramApi(token, { polling: true });

const botCommands = [
	{ command: "/schedule", description: "Показать расписание" },
	{ command: "/help", description: "Показать помощь" },
	{ command: "/groups", description: "Показать все существующие группы" },
	{ command: "/setgroup", description: "Изменить расписание по-умолчанию" },
	{
		command: "/subscribe",
		description: "Подписаться на обновления расписания",
	},
	{
		command: "/unsubscribe",
		description: "Отписаться от обновления расписания",
	},
];

bot.setMyCommands(botCommands);

const start = async () => {
	try {
		await mongoose.connect(process.env.MONGODB_URI);
		await fetchGroups();
		await checkSchedule();

		setInterval(checkSchedule, 1800 * 1000);

		bot.onText(/\/help/, async (msg) => {
			bot.sendMessage(msg.chat.id, await getHelpMessage(msg.chat.id));
		});

		bot.onText(/(\/schedule|расписание)/, async (msg) => {
			const group =
        (await getGroupFromMessage(msg.text)) ||
        (await getGroupByChatId(msg.chat.id));
			const chat = await chats.findOne({ id: msg.chat.id });

			if (!group) {
				bot.sendMessage(chat.id, "Группа не найдена");
				return;
			}

			await sendSchedule(chat, group);
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

			await chats.create({ id: msg.chat.id });
		});

		bot.onText(/\/subscribe/, async (msg) => {
			const group =
        (await getGroupFromMessage(msg.text)) ||
        (await getGroupByChatId(msg.chat.id));

			if (!group) {
				await bot.sendMessage(
					msg.chat.id,
					"Группа не найдена или вы ничего не ввели"
				);
				return;
			}

			await chatService.startSubscription(msg.chat.id, group.id);

			await bot.sendMessage(
				msg.chat.id,
				`Вы подписались на рассылку расписания группы ${group.name}`
			);
		});

		bot.onText(/\/unsubscribe/, async (msg) => {
			if (await chatService.stopSubscription(msg.chat.id)) {
				bot.sendMessage(msg.chat.id, "Вы отписались от рассылки расписания");
			} else {
				bot.sendMessage(msg.chat.id, "Вы не подписаны на рассылку расписания");
			}
		});

		bot.onText(/\/setgroup/, async (msg) => {
			const group = await getGroupFromMessage(msg.text);
			if (!group) {
				await bot.sendMessage(
					msg.chat.id,
					"Группа не найдена или Вы ничего не ввели"
				);
				return;
			}

			const chat = await chats.findOne({ id: msg.chat.id });

			chat.defaultGroup = group.id;

			await chat.save();

			await bot.sendMessage(
				chat.id,
				`Группа ${group.name} установлена по-умолчанию`
			);
		});

		bot.on("message", async (msg) => {
			console.log(`[${dayjs().format("HH:MM")}] ${msg.from.username}: ${msg.text}`);

			if (msg.chat.type === "private" && !msg.text.startsWith("/")) {
				const group = await getGroupFromMessage(msg.text);
				const chat = await chats.findOne({ id: msg.chat.id });

				if (group) {
					await sendSchedule(chat, group);
				}
			}
		});
	} catch (error) {
		console.log(error);
	}
};

start();

async function getGroupFromMessage(message) {
	const regexArr = message.match(/[А-я]{2,3}[\W]?\d{2}[\W]?\d{2}/g);
	const groupName = regexArr
		? regexArr[0].replaceAll("-", "").replaceAll(" ", "").toLowerCase()
		: "";

	const group = (await groups.find()).find(
		(group) => group.name.toLowerCase().replaceAll("-", "") === groupName
	);

	return group;
}

async function getGroupByChatId(chatId) {
	const chat = await chats.findOne({ id: chatId });

	const group = await groups.findOne({ id: chat?.defaultGroup });

	return group;
}

async function checkSchedule() {
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

		if (!compareSchedule(lastSchedule, newSchedule) && newSchedule?.lessons?.length) {
			chat.subscription.lastSchedule = newSchedule;
			await chat.save();

			const message = await getMessageSchedule(newSchedule, group);

			await bot.sendMessage(chat.id, "Вышло новое расписание!");
			await bot.sendMessage(chat.id, message);
		}
	}
}

async function sendSchedule(chat, group) {
	const currentDate = dayjs();

	const firstDate = getNextWorkDate(currentDate);
	const secondDate = getNextWorkDate(firstDate.add(1, "day"));

	const scheduleToday = await getSchedule(group.id, firstDate);
	const scheduleNext = await getSchedule(group.id, secondDate);

	await bot.sendMessage(
		chat.id,
		await getMessageSchedule(scheduleToday, group)
	);
	await bot.sendMessage(chat.id, await getMessageSchedule(scheduleNext, group));
}

async function getSchedule(groupId, date) {
	const url = SCHEDULE_API + `/${groupId}/${date.format("YYYY-MM-DD")}`;
	const schedule = (await axios.get(url)).data;

	return schedule;
}

async function fetchGroups() {
	const fetchedGroups = (await axios.get(GROUPS_API)).data.filter(
		(group) => group.name !== "--"
	);

	if (fetchedGroups) {
		await groups.deleteMany();
		await groups.insertMany(fetchedGroups);
	}
}

function compareSchedule(a, b) {
	return JSON.stringify(a) === JSON.stringify(b);
}
