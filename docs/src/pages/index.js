import { useEffect } from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

export default function Home() {
  const { siteConfig } = useDocusaurusContext();

  useEffect(() => {
    // Force redirect using window.location to ensure proper base path
    const redirectUrl = `${siteConfig.baseUrl}intro`;
    window.location.replace(redirectUrl);
  }, [siteConfig.baseUrl]);

  return null;
} 