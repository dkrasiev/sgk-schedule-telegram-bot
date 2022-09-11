const { Schema, model } = require("mongoose");

const ScheduleSchema = new Schema({
	date: String,
	lessons: [{
		title: String,
		num: String,
		teachername: String,
		nameGroup: String,
		cab: String,
		resource: String,
	}],
});

module.exports = model("Schedule", ScheduleSchema);
