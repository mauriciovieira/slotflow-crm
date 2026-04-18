import { createBrowserRouter } from "react-router";
import { Landing } from "./screens/Landing";

export const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
]);
