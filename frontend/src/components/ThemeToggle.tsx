import { useConstCallback } from "powerhooks";
import { Helmet } from "react-helmet-async";
import { useTheme } from "../contexts/ThemeContext";

export default function ThemeToggle() {
  const { darkMode, setDarkMode } = useTheme();

  const onThemeToggle = useConstCallback(() => {
    setDarkMode((prev) => !prev);
  });

  return (
    <>
      <Helmet>
        <body className={darkMode ? "dark-theme" : undefined} />
      </Helmet>
      <button
        style={{width: "32px", height: "32px"}}
        onClick={onThemeToggle}
        className="icon-button"
        role="toggle"
      >
        <span className="material-icons-outlined" style={{ fontSize: "32px" }}>
          {darkMode ? "light_mode" : "dark_mode"}
        </span>
      </button>
    </>
  );
}