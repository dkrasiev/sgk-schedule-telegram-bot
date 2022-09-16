const {Schema, model} = require('mongoose');

const ChatSchema = new Schema({
  id: {type: Number, require: true},
  defaultGroup: Number,
  subscription: {
    groupId: Number,
    lastSchedule: {
      date: String,
      lessons: [
        {
          title: String,
          num: String,
          teachername: String,
          nameGroup: String,
          cab: String,
          resource: String,
        },
      ],
    },
  },
});

module.exports = model('Chat', ChatSchema);
