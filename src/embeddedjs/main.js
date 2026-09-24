/*
 * PebTrader Zero - watch-side (embeddedjs) entry point.
 *
 * This renders a minimal hello-world screen to validate the Alloy toolchain
 * on emery/gabbro. The real order list/detail UI is built in later issues.
 */

import {} from "piu/MC";

const backgroundSkin = new Skin({ fill: "white" });

const titleStyle = new Style({
	font: "bold 18px Gothic",
	color: "black",
	horizontal: "center",
	vertical: "middle",
});

class AppBehavior extends Behavior {
	onDisplaying(application) {
		console.log("PebTrader Zero ready");
	}
}

const App = Application.template($ => ({
	skin: backgroundSkin,
	style: titleStyle,
	Behavior: AppBehavior,
	contents: [
		Label($, {
			left: 0, right: 0, top: 0, bottom: 0,
			string: "PebTrader Zero",
		}),
	],
}));

export default new App(null, { displayListLength: 2048 });
