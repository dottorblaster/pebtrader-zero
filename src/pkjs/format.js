/*
 * Small ISO date formatting helpers shared by the PKJS formatters.
 */

function formatDate(iso) {
	if (typeof iso !== "string" || iso.length < 10) return null;
	return iso.slice(0, 10);
}

function formatDateTime(iso) {
	if (typeof iso !== "string" || iso.length < 16) return null;
	return iso.slice(0, 10) + " " + iso.slice(11, 16);
}

module.exports = {
	formatDate: formatDate,
	formatDateTime: formatDateTime,
};
