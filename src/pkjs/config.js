/*
 * Clay configuration page for PebTrader Zero.
 *
 * Rendered inside the Pebble mobile app. The API token stays on the phone:
 * it is stored in PKJS localStorage and never sent to the watch (see
 * src/pkjs/index.js).
 *
 * Docs: https://developer.repebble.com/guides/user-interfaces/app-configuration/
 */

module.exports = [
	{
		type: "heading",
		defaultValue: "PebTrader Zero",
	},
	{
		type: "text",
		defaultValue:
			"Show the state of your CardTrader Zero orders on your Pebble. " +
			"Your settings are stored on this phone.",
	},
	{
		type: "section",
		items: [
			{
				type: "heading",
				defaultValue: "CardTrader account",
			},
			{
				type: "input",
				id: "api-token",
				messageKey: "API_TOKEN",
				label: "API token",
				description:
					"Find it under CardTrader > Settings > API. Stored on your phone and never sent to the watch.",
				attributes: {
					type: "password",
					placeholder: "paste your CardTrader token",
					autocomplete: "off",
				},
			},
			{
				type: "text",
				id: "token-status",
				defaultValue: "",
			},
		],
	},
	{
		type: "section",
		items: [
			{
				type: "heading",
				defaultValue: "What to show",
			},
			{
				type: "select",
				messageKey: "ROLE",
				label: "Orders",
				defaultValue: "both",
				options: [
					{ label: "My purchases (buyer)", value: "buyer" },
					{ label: "My sales (seller)", value: "seller" },
					{ label: "Both", value: "both" },
				],
			},
			{
				type: "toggle",
				messageKey: "CT0_ONLY",
				label: "CardTrader Zero orders only",
				defaultValue: true,
			},
			{
				type: "select",
				messageKey: "REFRESH_MINUTES",
				label: "Refresh interval",
				defaultValue: "15",
				serializeValueAs: "integer",
				options: [
					{ label: "Manual only", value: "0" },
					{ label: "Every 15 minutes", value: "15" },
					{ label: "Every 30 minutes", value: "30" },
					{ label: "Every hour", value: "60" },
				],
			},
		],
	},
	{
		type: "submit",
		id: "submit",
		defaultValue: "Save settings",
	},
];
