import "./style.css";
import { App } from "./app";

const root = document.getElementById("app");
if (!root) throw new Error("マウント先の要素が見つからない");
new App(root);
