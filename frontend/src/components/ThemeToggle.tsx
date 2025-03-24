import React, { useEffect } from 'react';

const ThemeToggle: React.FunctionComponent = () => {
    useEffect(() => {
        const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
        const savedTheme = localStorage.getItem('theme');
        const body = document.body;
        if (savedTheme) {
            body.setAttribute('data-theme', savedTheme);
        } else {
            body.setAttribute('data-theme', prefersDarkScheme.matches ? 'dark' : 'light');
        }

        let element = document.getElementById('theme-indicator');
        if (element != null) {
            toggleThemeIcon(element, body.getAttribute('data-theme') === 'dark');
        }
    }, []);

    const toggleThemeIcon = (target: HTMLElement, isDark: boolean) => {
        if (isDark) {
            target.innerHTML = '<span class="material-icons-outlined" style="font-size: 32px">light_mode</span>';
        } else {
            target.innerHTML = '<span class="material-icons-outlined" style="font-size: 32px">dark_mode</span>';
        }
    };

    const toggleTheme = (target: HTMLElement) => {
        const body = document.body;
        const currentTheme = body.getAttribute('data-theme');

        if (currentTheme === 'dark') {
            body.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            toggleThemeIcon(target, false);
        } else {
            body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            toggleThemeIcon(target, true);
        }
    };

    return (
        <div
            id="theme-indicator"
            style={{ width: "32px", height: "32px", cursor: "pointer" }}
            onClick={(e) => {
                toggleTheme(e.currentTarget);
            }}
        >
        </div>
    );
};

export default ThemeToggle;
