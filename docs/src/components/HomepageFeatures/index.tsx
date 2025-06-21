import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  icon: string;
  description: JSX.Element;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Action-Oriented AI',
    icon: '🎯',
    description: (
      <>
        Unlike traditional AI that just responds, Operon.one takes action. 
        It can browse the web, execute code, manage files, and interact with external services.
      </>
    ),
  },
  {
    title: 'Extensible Tool System',
    icon: '🔧',
    description: (
      <>
        Built with a modular architecture that allows you to add custom tools 
        and integrations easily. Create your own tools or use our comprehensive library.
      </>
    ),
  },
  {
    title: 'Enterprise Ready',
    icon: '🛡️',
    description: (
      <>
        Includes user management, admin panels, rate limiting, and security features 
        out of the box. Ready for production deployment.
      </>
    ),
  },
];

function Feature({title, icon, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <div className={styles.featureIcon} style={{fontSize: '4rem', marginBottom: '1rem'}}>
          {icon}
        </div>
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
