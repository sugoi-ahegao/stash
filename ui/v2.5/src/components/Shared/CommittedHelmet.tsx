import React, { useEffect, useState } from "react";
import { Helmet, HelmetProps } from "react-helmet";

// react-helmet registers itself while rendering and only unregisters on unmount.
// Under React 18, a render that suspends on a lazy sibling is thrown away without
// ever unmounting, so a Helmet in it stays registered for good and its title leaks
// onto every later page. Rendering it only after the first commit avoids that. Use
// this instead of Helmet in a component that renders lazy children next to it.
export const CommittedHelmet: React.FC<React.PropsWithChildren<HelmetProps>> = (
  props
) => {
  const [committed, setCommitted] = useState(false);

  useEffect(() => setCommitted(true), []);

  return committed ? <Helmet {...props} /> : null;
};
