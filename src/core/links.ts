/** Link to a module's page. Lives in the core so modules can link to each other without importing the shell. */
export const moduleHref = (moduleId: string) => `#/m/${moduleId}`;
