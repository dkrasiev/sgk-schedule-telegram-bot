const {Schema, model} = require('mongoose');

const GroupSchema = new Schema({
  id: Number,
  name: String,
});

module.exports = model('Group', GroupSchema);
