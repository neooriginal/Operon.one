import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Operon.one',
  description: 'Next-Generation Action-AI Documentation',
  base: '/OperonOne/',
  
  head: [
    ['link', { rel: 'icon', href: '/OperonOne/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#3c82f6' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:locale', content: 'en' }],
    ['meta', { property: 'og:title', content: 'Operon.one | Next-Generation Action-AI' }],
    ['meta', { property: 'og:site_name', content: 'Operon.one' }],
    ['meta', { property: 'og:image', content: 'https://neooriginal.github.io/OperonOne/og-image.png' }],
    ['meta', { property: 'og:url', content: 'https://neooriginal.github.io/OperonOne/' }]
  ],

  themeConfig: {
    logo: '/logo.png',
    
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/' },
      { text: 'Tools', link: '/tools/' },
      { text: 'GitHub', link: 'https://github.com/neooriginal/Operon.one' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Quick Start', link: '/guide/getting-started' },
            { text: 'Docker Setup', link: '/guide/docker-setup' },
            { text: 'Development Setup', link: '/guide/development' }
          ]
        },
        {
          text: 'Configuration',
          items: [
            { text: 'Environment Variables', link: '/guide/configuration/environment' },
            { text: 'Admin Panel', link: '/guide/configuration/admin-panel' },
            { text: 'Email Setup', link: '/guide/configuration/email' }
          ]
        },
        {
          text: 'Features',
          items: [
            { text: 'AI Tools', link: '/guide/features/ai-tools' },
            { text: 'MCP Integration', link: '/guide/features/mcp' },
            { text: 'User Management', link: '/guide/features/user-management' }
          ]
        }
      ],
      '/tools/': [
        {
          text: 'Available Tools',
          items: [
            { text: 'Overview', link: '/tools/' },
            { text: 'AI Tools', link: '/tools/ai' },
            { text: 'Browser Tools', link: '/tools/browser' },
            { text: 'File System', link: '/tools/filesystem' },
            { text: 'Web Search', link: '/tools/web-search' },
            { text: 'Image Generation', link: '/tools/image-generation' },
            { text: 'Python Execute', link: '/tools/python-execute' },
            { text: 'Math Tools', link: '/tools/math' },
            { text: 'Email Tools', link: '/tools/email' }
          ]
        },
        {
          text: 'Development',
          items: [
            { text: 'Creating Tools', link: '/tools/development/creating-tools' },
            { text: 'Tool Structure', link: '/tools/development/structure' },
            { text: 'Testing Tools', link: '/tools/development/testing' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'Authentication', link: '/api/authentication' },
            { text: 'Users', link: '/api/users' },
            { text: 'Tools', link: '/api/tools' },
            { text: 'Admin', link: '/api/admin' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/neooriginal/Operon.one' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present Operon.one'
    },

    editLink: {
      pattern: 'https://github.com/neooriginal/Operon.one/edit/main/docs/:path'
    },

    search: {
      provider: 'local'
    }
  },

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    },
    lineNumbers: true
  }
}) 