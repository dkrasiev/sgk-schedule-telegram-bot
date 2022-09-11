const { Schema, model } = require("mongoose");

const LessonSchema = new Schema({
	title: String,
	num: String,
	teachername: String,
	nameGroup: String,
	cab: String,
	resource: String,
});

module.exports = model("Lesson", LessonSchema);