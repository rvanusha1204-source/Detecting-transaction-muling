import { createRoot } from "react-dom/client";

console.log("main.tsx is executing");
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
