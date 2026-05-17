import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./context/ThemeContext";
import { CartProvider } from "./context/Cartcontext";
import { AuthProvider } from "./context/AuthContext";  // ← add this
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <CartProvider>
          <AuthProvider>          {/* ← wrap here */}
            <App />
          </AuthProvider>         {/* ← close here */}
        </CartProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);