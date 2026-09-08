'use strict';

const REGISTRY = {
  javascript: {
    manifestFiles: ['package.json'],
    frameworks: {
      nextjs:    { detectionFiles: ['next.config.js','next.config.ts','next.config.mjs'], detectionDeps: ['next'],               srcDirs: ['app','src/app','pages','src/pages','src','components','lib','hooks','utils'], entrypoints: ['app/page.tsx','pages/index.tsx'] },
      nestjs:    { detectionFiles: ['nest-cli.json'],                                    detectionDeps: ['@nestjs/core'],        srcDirs: ['src'], entrypoints: ['src/main.ts','src/app.module.ts'] },
      express:   { detectionFiles: [],                                                    detectionDeps: ['express'],             srcDirs: ['src','routes','middleware','controllers','services'], entrypoints: ['src/index.js','server.js','app.js'] },
      fastify:   { detectionFiles: [],                                                    detectionDeps: ['fastify'],             srcDirs: ['src','routes','plugins'], entrypoints: ['src/index.js'] },
      react:     { detectionFiles: [],                                                    detectionDeps: ['react'],               srcDirs: ['src','components','hooks','context','pages','app','lib','utils'] },
      vue:       { detectionFiles: ['vue.config.js','vue.config.ts'],                    detectionDeps: ['vue'],                 srcDirs: ['src','components','composables','pages','views'] },
      nuxt:      { detectionFiles: ['nuxt.config.js','nuxt.config.ts'],                  detectionDeps: ['nuxt'],                srcDirs: ['pages','components','composables','server','middleware','plugins'] },
      svelte:    { detectionFiles: ['svelte.config.js'],                                 detectionDeps: ['svelte','@sveltejs/kit'], srcDirs: ['src','src/routes','src/lib'] },
      angular:   { detectionFiles: ['angular.json'],                                     detectionDeps: ['@angular/core'],       srcDirs: ['src','src/app','projects','apps','libs'] },
      gatsby:    { detectionFiles: ['gatsby-config.js','gatsby-config.ts'],              detectionDeps: ['gatsby'],              srcDirs: ['src','gatsby'] },
      vite:      { detectionFiles: ['vite.config.js','vite.config.ts'],                  detectionDeps: ['vite'],                srcDirs: ['src'] },
      remix:     { detectionFiles: ['remix.config.js'],                                  detectionDeps: ['@remix-run/react'],    srcDirs: ['app'] },
      trpc:      { detectionFiles: [],                                                    detectionDeps: ['@trpc/server'],        srcDirs: ['src','server','routers'] },
    },
    srcDirs:  ['src','lib','index.js','server.js','app.js'],
    penalties: ['dist','build','.next','.nuxt','coverage','storybook-static'],
  },

  typescript: {
    manifestFiles: ['package.json','tsconfig.json'],
    frameworks: {
      nextjs:  { detectionFiles: ['next.config.ts','next.config.mjs'], detectionDeps: ['next'],            srcDirs: ['app','src/app','pages','src','components','lib','hooks','utils'] },
      nestjs:  { detectionFiles: ['nest-cli.json'],                     detectionDeps: ['@nestjs/core'],   srcDirs: ['src'], entrypoints: ['src/main.ts'] },
      angular: { detectionFiles: ['angular.json'],                      detectionDeps: ['@angular/core'],  srcDirs: ['src','src/app','projects','apps','libs'] },
    },
    srcDirs:  ['src','lib','packages'],
    penalties: ['dist','build','.next'],
  },

  python: {
    manifestFiles: ['requirements.txt','pyproject.toml','setup.py','Pipfile'],
    frameworks: {
      django:  { detectionFiles: ['manage.py'],           detectionDeps: ['Django'],  srcDirs: [],         specialRule: 'django-app-dirs', entrypoints: ['manage.py'] },
      fastapi: { detectionFiles: [],                       detectionDeps: ['fastapi'], srcDirs: ['app','src','routers','api'], entrypoints: ['main.py','app/main.py'] },
      flask:   { detectionFiles: ['wsgi.py','app.py'],    detectionDeps: ['Flask'],   srcDirs: ['app','src'], entrypoints: ['app.py','wsgi.py'] },
      celery:  { detectionFiles: [],                       detectionDeps: ['celery'],  srcDirs: ['tasks','workers','app'] },
    },
    srcDirs:  ['.'],
    penalties: ['venv','.venv','__pycache__','.pytest_cache','htmlcov'],
  },

  go: {
    manifestFiles: ['go.mod'],
    frameworks: {
      gin:   { detectionFiles: [], detectionDeps: ['github.com/gin-gonic/gin'],      srcDirs: ['internal','cmd','pkg','api','handler','middleware'] },
      echo:  { detectionFiles: [], detectionDeps: ['github.com/labstack/echo'],      srcDirs: ['internal','cmd','handler','middleware'] },
      fiber: { detectionFiles: [], detectionDeps: ['github.com/gofiber/fiber'],      srcDirs: ['internal','cmd','handler','routes'] },
      grpc:  { detectionFiles: [], detectionDeps: ['google.golang.org/grpc'],        srcDirs: ['internal','proto','server','client'] },
      chi:   { detectionFiles: [], detectionDeps: ['github.com/go-chi/chi'],         srcDirs: ['internal','cmd','handler'] },
    },
    srcDirs:  ['internal','cmd','pkg','api'],
    penalties: ['vendor'],
  },

  rust: {
    manifestFiles: ['Cargo.toml'],
    frameworks: {
      actix: { detectionFiles: [], detectionDeps: ['actix-web'], srcDirs: ['src'] },
      axum:  { detectionFiles: [], detectionDeps: ['axum'],      srcDirs: ['src'] },
      tauri: { detectionFiles: ['src-tauri/tauri.conf.json'], detectionDeps: ['tauri'], srcDirs: ['src','src-tauri/src'] },
    },
    srcDirs:  ['src'],
    penalties: ['target'],
  },

  java: {
    manifestFiles: ['pom.xml','build.gradle'],
    frameworks: {
      spring:   { detectionFiles: [], detectionDeps: ['spring-boot'], srcDirs: ['src/main/java','src/main/kotlin','src/main/resources'] },
      quarkus:  { detectionFiles: [], detectionDeps: ['io.quarkus'],  srcDirs: ['src/main/java'] },
      android:  { detectionFiles: ['AndroidManifest.xml'],            srcDirs: ['app/src/main/java','app/src/main','src'] },
      micronaut:{ detectionFiles: [], detectionDeps: ['io.micronaut'],srcDirs: ['src/main/java'] },
    },
    srcDirs:  ['src/main/java','src'],
    penalties: ['target','build'],
  },

  kotlin: {
    manifestFiles: ['build.gradle.kts'],
    frameworks: {
      spring:  { detectionFiles: [], detectionDeps: ['spring-boot'],    srcDirs: ['src/main/kotlin'] },
      android: { detectionFiles: ['AndroidManifest.xml'],               srcDirs: ['app/src/main/kotlin','app/src/main/java'] },
      ktor:    { detectionFiles: [], detectionDeps: ['io.ktor'],         srcDirs: ['src'] },
      compose: { detectionFiles: [], detectionDeps: ['compose-runtime'], srcDirs: ['app/src/main/kotlin','src'] },
    },
    srcDirs:  ['src/main/kotlin','src'],
    penalties: ['build','.gradle'],
  },

  csharp: {
    manifestFiles: ['.csproj','.sln'],
    frameworks: {
      aspnet:  { detectionFiles: ['appsettings.json'], detectionDeps: ['Microsoft.AspNetCore'], srcDirs: ['Controllers','Services','Models','Middleware','Pages'] },
      blazor:  { detectionFiles: [], detectionDeps: ['Microsoft.AspNetCore.Components'],        srcDirs: ['Components','Pages','Services'] },
      unity:   { detectionFiles: ['ProjectSettings/ProjectSettings.asset'],                     srcDirs: ['Assets/Scripts','Assets'] },
      maui:    { detectionFiles: [], detectionDeps: ['Microsoft.Maui'],                          srcDirs: ['src','Pages','ViewModels'] },
    },
    srcDirs:  ['src','Controllers','Services','Models'],
    penalties: ['bin','obj','.vs'],
  },

  php: {
    manifestFiles: ['composer.json'],
    frameworks: {
      laravel:   { detectionFiles: ['artisan'],           srcDirs: ['app','routes','config','database','resources','tests'], entrypoints: ['artisan'] },
      symfony:   { detectionFiles: ['symfony.lock'],      srcDirs: ['src','config','templates'], specialRule: 'symfony-bundle-dirs' },
      wordpress: { detectionFiles: ['wp-config.php'],     srcDirs: ['wp-content/themes','wp-content/plugins','wp-content/mu-plugins'] },
      slim:      { detectionFiles: [],                    detectionDeps: ['slim/slim'], srcDirs: ['src','app','routes'] },
    },
    srcDirs:  ['src','app'],
    penalties: ['vendor'],
  },

  ruby: {
    manifestFiles: ['Gemfile'],
    frameworks: {
      rails:   { detectionFiles: ['config/routes.rb'],   srcDirs: ['app','lib','config','db','spec','test'], entrypoints: ['config/routes.rb'] },
      sinatra: { detectionFiles: ['config.ru','app.rb'], srcDirs: ['.','lib'],            entrypoints: ['app.rb','config.ru'] },
      hanami:  { detectionFiles: [],                     detectionDeps: ['hanami'],       srcDirs: ['apps','lib','slices'] },
    },
    srcDirs:  ['app','lib'],
    penalties: ['vendor','coverage','.bundle'],
  },

  swift: {
    manifestFiles: ['Package.swift'],
    frameworks: {
      vapor:   { detectionFiles: [],              detectionDeps: ['vapor/vapor'], srcDirs: ['Sources','App'] },
      swiftui: { detectionFiles: ['.xcodeproj'],  srcDirs: [],                    specialRule: 'swift-project-dir' },
      swiftpm: { detectionFiles: ['Package.swift'],srcDirs: ['Sources'] },
    },
    srcDirs:  ['Sources','Source'],
    penalties: ['.build','DerivedData','Pods','Carthage'],
  },

  dart: {
    manifestFiles: ['pubspec.yaml'],
    frameworks: {
      flutter:    { detectionFiles: [],                   detectionDeps: ['flutter'],    srcDirs: ['lib','lib/src'], entrypoints: ['lib/main.dart'] },
      serverpod:  { detectionFiles: [],                   detectionDeps: ['serverpod'],  srcDirs: ['lib','endpoints','models'] },
      'dart-frog':{ detectionFiles: ['dart_frog.yaml'],   srcDirs: ['routes','lib'] },
    },
    srcDirs:  ['lib','lib/src'],
    penalties: ['.dart_tool','build'],
  },

  scala: {
    manifestFiles: ['build.sbt'],
    frameworks: {
      akka:  { detectionFiles: [], detectionDeps: ['akka'], srcDirs: ['src/main/scala','src'] },
      play:  { detectionFiles: [], detectionDeps: ['play'], srcDirs: ['app','conf'] },
      spark: { detectionFiles: [], detectionDeps: ['spark'],srcDirs: ['src/main/scala'] },
      zio:   { detectionFiles: [], detectionDeps: ['zio'], srcDirs: ['src/main/scala'] },
    },
    srcDirs:  ['src/main/scala','src'],
    penalties: ['target'],
  },

  lua: {
    manifestFiles: ['.luarc.json', 'selene.toml', 'stylua.toml'],
    frameworks: {
      luarocks: { detectionFiles: ['*.rockspec'], srcDirs: ['src','lua','lib'] },
    },
    srcDirs:  ['src','lua','lib'],
    penalties: ['.luarocks','luarocks_modules'],
  },

  r: {
    manifestFiles: ['DESCRIPTION','renv.lock'],
    frameworks: {
      shiny: { detectionFiles: ['app.R','ui.R','server.R'], srcDirs: ['R','inst','tests'], entrypoints: ['app.R','server.R'] },
    },
    srcDirs:  ['R','src','inst'],
    penalties: ['renv','packrat','.Rcheck'],
  },
};

module.exports = { REGISTRY };
