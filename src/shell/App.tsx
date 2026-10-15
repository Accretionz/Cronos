import { useModules } from "../core";
import { Dashboard } from "./Dashboard";
import { Nav } from "./Nav";
import { href, parseRoute, useHash } from "./router";
import { Settings } from "./Settings";

export function App() {
  const route = parseRoute(useHash());
  const modules = useModules();
  const withPages = modules.filter((m) => m.page);

  let content;
  if (route.name === "settings") {
    content = <Settings />;
  } else if (route.name === "module") {
    const mod = withPages.find((m) => m.id === route.id);
    const Page = mod?.page;
    content = Page ? <Page /> : <NotFound />;
  } else {
    content = <Dashboard />;
  }

  return (
    <div className="app">
      <Nav route={route} />
      <main className="main">{content}</main>
      {modules.map((m) => {
        const Overlay = m.overlay;
        return Overlay ? <Overlay key={m.id} /> : null;
      })}
    </div>
  );
}

function NotFound() {
  return (
    <div className="page">
      <h1>Not found</h1>
      <p className="muted">
        This module is switched off or doesn't exist. <a href={href.today}>Back to Today</a>
      </p>
    </div>
  );
}
