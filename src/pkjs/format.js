/*
 * Small ISO date formatting helpers shared by the PKJS formatters.
 */

var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso) {
	if (typeof iso !== "string" || iso.length < 10) return null;
	return iso.slice(0, 10);
}

/**
 * Compact "21 Sep". The watch screens are narrow and the group lines carry a
 * name, a price and a date, so the year is not worth the width.
 */
function formatDay(iso) {
	if (typeof iso !== "string" || iso.length < 10) return null;
	var month = Number(iso.slice(5, 7));
	if (!(month >= 1 && month <= 12)) return null;
	return Number(iso.slice(8, 10)) + " " + MONTHS[month - 1];
}

function formatDateTime(iso) {
	if (typeof iso !== "string" || iso.length < 16) return null;
	return iso.slice(0, 10) + " " + iso.slice(11, 16);
}

module.exports = {
	formatDate: formatDate,
	formatDay: formatDay,
	formatDateTime: formatDateTime,
};
