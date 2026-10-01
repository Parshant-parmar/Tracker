import { useEffect, useState } from 'react';

const read = () => window.location.hash.replace(/^#\/?/, '');
export function useHashRoute() {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
export const go = (to) => { window.location.hash = `/${to}`; };
export function Link({ to, children, ...rest }) {
  return <a href={`#/${to}`} {...rest}>{children}</a>;
}
