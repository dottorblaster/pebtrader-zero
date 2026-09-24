/*
 * PebTrader Zero - watch-side (embeddedjs) entry point.
 *
 * Renders a hello-world screen for now; the real order list/detail UI lands in
 * later issues. Importing the shared protocol here proves the PKJS/watch field
 * definitions resolve on the watch.
 */

import {} from "piu/MC";
import { CHUNK_SIZE } from "./protocol";

const backgroundSkin = new Skin({ fill: "white" });

const titleStyle = new Style({
	font: "bold 18px Gothic",
	color: "black",
	horizontal: "center",
	vertical: "middle",
});

class AppBehavior extends Behavior {
	onDisplaying(application) {
		console.log("PebTrader Zero ready (chunk=" + CHUNK_SIZE + ")");
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
