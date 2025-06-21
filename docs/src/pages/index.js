import { useEffect } from 'react';
import { useHistory } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';

export default function Home() {
  const history = useHistory();
  const baseUrl = useBaseUrl('/intro');

  useEffect(() => {
    history.replace(baseUrl);
  }, [history, baseUrl]);

  return null;
} 