const groups = require("../models/group.model");
const numToTime = require("./numToTime");

class MessageGenerator {
	async getMessageAllGroups() {
		return (await groups.find()).map((group) => group.name).join("\n");
	}

	async getMessageSchedule(schedule, group) {
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

	async getHelpMessage(chatId) {
		const defaultGroup = await groups.findOne({id: chatId});
  
		let message =
      "Для получения расписания напишите:" +
      "\nрасписание <номер группы>" +
      "\n\nПример номера группы: ис-19-04, ис1904, ис 19 04\n";
  
		message += defaultGroup
			? `По-умолчанию выбрана группа ${defaultGroup.name}`
			: "Группа по-умолчанию не выбрана. " +
        "Чтобы установить группу введите \"/setgroup <номер группы>\"";
  
		return message;
	}
}

module.exports = new MessageGenerator();
