const { Telegraf, Markup } = require("telegraf");

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

let token = process.env.BOT_TOKEN;
if (process.env.ENV_MODE === "dev") {
	token = process.env.BOT_TOKEN_TEST;
}

const bot = new Telegraf(token);

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

bot.telegram.setMyCommands(botCommands);

const start = async () => {
	try {
		await mongoose.connect(process.env.MONGODB_URI);
		await fetchGroups();
		await checkSchedule();

		setInterval(checkSchedule, 1800 * 1000);

		bot.on("message", async (ctx, next) => {
			const chat = await chats.findOne({ id: ctx.chat.id });
			if (!chat) {
				await chats.create({ id: ctx.chat.id });
			}

			next();
		});

		bot.on("message", async (ctx, next) => {
			console.log(
				`[${dayjs().format("HH:mm")}] ${ctx.from.username}: ${ctx.message.text}`
			);

			next();
		});

		bot.start(async (ctx) => {
			await ctx.reply(`Привет, ${ctx.from.first_name}`);
			await ctx.reply("Чтобы узнать как я работаю, введи команду /help");
		});

		bot.help(async (ctx) => {
			const chat = await chats.findOne({ id: ctx.chat.id });

			const inlineKeyboard = chat.defaultGroup
				? Markup.inlineKeyboard([
					Markup.button.callback(
						"Удалить группу по умолчанию",
						"remove_default_group"
					),
				])
					.oneTime()
					.resize()
				: undefined;

			await ctx.reply(await getHelpMessage(ctx.chat.id), inlineKeyboard);
		});

		bot.action("remove_default_group", async (ctx) => {
			const chat = await chats.findOne({ id: ctx.chat.id });
			let resultMessage = "Группа по умолчанию удалена";

			if (!chat.defaultGroup) {
				resultMessage = "Группа по умолчанию не задана";
			} else {
				chat.defaultGroup = null;
				await chat.save();
			}

			await ctx.answerCbQuery();
			await ctx.reply(resultMessage);
		});

		bot.command("groups", async (ctx) => {
			await ctx.reply(await getMessageAllGroups());
		});

		bot.command("setgroup", async (ctx) => {
			const group = await getGroupFromMessage(ctx.message.text);
			const chat = await chats.findOne({ id: ctx.chat.id });

			if (!group) {
				await ctx.reply("Группа не найдена или Вы ничего не ввели");
				return;
			}

			chat.defaultGroup = group.id;
			await chat.save();

			await ctx.reply(`Группа ${group.name} установлена по-умолчанию`);
		});

		bot.command("subscribe", async (ctx) => {
			const group =
        (await getGroupFromMessage(ctx.message.text)) ||
        (await getGroupByChatId(ctx.chat.id));

			if (!group) {
				await ctx.reply("Группа не найдена или вы ничего не ввели");
				return;
			}

			await chatService.startSubscription(ctx.chat.id, group.id);
			await ctx.reply(
				`Вы подписались на рассылку расписания группы ${group.name}`
			);
		});

		bot.command("unsubscribe", async (ctx) => {
			const chatId = ctx.chat.id;
			if (await chatService.stopSubscription(chatId)) {
				await ctx.reply("Вы отписались от рассылки расписания");
			} else {
				await ctx.reply("Вы не подписаны на рассылку расписания");
			}
		});

		bot.command("schedule", async (ctx) => {
			const group =
        (await getGroupFromMessage(ctx.message.text)) ||
        (await getGroupByChatId(ctx.chat.id));
			const chat = await chats.findOne({ id: ctx.chat.id });

			if (!group) {
				await ctx.reply("Группа не найдена");
				return;
			}

			await sendSchedule(ctx, chat, group);
		});

		bot.hears(/расписание/, async (ctx) => {
			const group =
        (await getGroupFromMessage(ctx.message.text)) ||
        (await getGroupByChatId(ctx.chat.id));
			const chat = await chats.findOne({ id: ctx.chat.id });

			if (!group) {
				await ctx.reply("Группа не найдена");
				return;
			}

			await sendSchedule(ctx, chat, group);
		});

		bot.hears(/[А-я]{2,3}[\W]?\d{2}[\W]?\d{2}/g, async (ctx) => {
			const group = await getGroupFromMessage(ctx.message.text);
			const chat = await chats.findOne({ id: ctx.chat.id });

			if (ctx.chat.type === "private") {
				if (chat && group) {
					await sendSchedule(ctx, chat, group);
				} else {
					await ctx.reply("Группа не найдена");
				}
			}
		});

		bot.on("message", async (ctx, next) => {
			if (ctx.chat.type === "private") await ctx.reply("Я тебя не понимаю");

			next();
		});

		bot.launch();

		// Enable graceful stop
		process.once("SIGINT", () => bot.stop("SIGINT"));
		process.once("SIGTERM", () => bot.stop("SIGTERM"));
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

async function getSchedule(groupId, date) {
	const url = SCHEDULE_API + `/${groupId}/${date.format("YYYY-MM-DD")}`;
	const schedule = (await axios.get(url)).data;

	return schedule;
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

function compareSchedule(a, b) {
	return JSON.stringify(a) === JSON.stringify(b);
}
