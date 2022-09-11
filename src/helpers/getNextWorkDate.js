module.exports = function (date) {
	switch (date.day()) {
	case 0:
		date = date.add(1, "day");
		break;
	case 6: {
		date = date.add(2, "day");
	}
	}

	return date;
};