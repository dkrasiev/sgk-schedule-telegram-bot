const chats = require("../models/chat.model");
const getNextWorkDate  = require("../helpers/getNextWorkDate");
const dayjs = require("dayjs");
const { SCHEDULE_API } = require("../helpers/api");
const { default: axios } = require("axios");

class ChatService {
	async startSubscription(chatId, groupId) {
		const dateNext = getNextWorkDate(getNextWorkDate(dayjs().add(1, "day")));
		const currentSchedule = (await axios.get(SCHEDULE_API + "/" + groupId +"/" + dateNext.format("YYYY-MM-DD"))).data;
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
}

module.exports = new ChatService();
