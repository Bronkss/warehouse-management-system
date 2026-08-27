# ТОЧКА - Система складского учёта
## 1. Архитектура системы
#### 1.1. Общая архитектура

Проект построен как full-stack приложение на Next.js с использованием App Router.

Упрощённо архитектуру можно представить так:

```
┌──────────────────────────────────────────────┐
│                 Пользователь                 │
│          ПК / ноутбук / мобильное устройство │
└──────────────────────┬───────────────────────┘
                       │ HTTP / HTTPS
                       ▼
┌──────────────────────────────────────────────┐
│                  Next.js 16                  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │            App Router / UI             │  │
│  │                                        │  │
│  │ products / inventory / purchase /      │  │
│  │ priemka / otgruzki / sales / касса /   │  │
│  │ deliveries / statistics и т.д.         │  │
│  └───────────────────┬────────────────────┘  │
│                      │                       │
│  ┌───────────────────▼────────────────────┐  │
│  │             API Routes                 │  │
│  │                                        │  │
│  │ products / inventory / acceptance /    │  │
│  │ shipment / sales / purchase /          │  │
│  │ locations / deliveries / statistics    │  │
│  └───────────────────┬────────────────────┘  │
│                      │                       │
│  ┌───────────────────▼────────────────────┐  │
│  │       Server-side business logic       │  │
│  │              app/lib                   │  │
│  └───────────────────┬────────────────────┘  │
└──────────────────────┼───────────────────────┘
                       │ PostgreSQL protocol
                       ▼
┌──────────────────────────────────────────────┐
│               PostgreSQL / Neon              │
│                                              │
│ products                                     │
│ product_stocks                               │
│ locations                                    │
│ stock_movements                              │
│ product_acceptances                          │
│ product_acceptance_items                     │
│ и другие таблицы                             │
└──────────────────────────────────────────────┘
```

#### 1.2. Основные технологические уровни

**Presentation Layer**

Отвечает за пользовательский интерфейс.

Расположен преимущественно в:

```
app/
├── page.tsx
├── components/
├── inventory/
├── products/
├── purchase/
├── sales/
├── priemka/
├── otgruzki/
├── deliveries/
├── online-kassa/
└── statistics/
```

Структура `app/` показывает, что функциональность разделена преимущественно по бизнес-модулям, а не по типу файлов.

**Application/API Layer**

API расположено внутри:

```
app/api/
```

В текущей версии присутствуют отдельные API-модули:

```
app/api/
├── acceptance/
├── deliveries/
├── inventory/
├── locations/
├── products/
├── purchase/
├── sales/
├── shipment/
├── statistics/
└── writeoff/
```

Это важное архитектурное решение: API сгруппировано по предметным областям системы.

Например:

```
/api/products
/api/inventory
/api/acceptance
/api/shipment
/api/sales
```

а не один общий endpoint для всех операций.

**Data Layer**

Работа с БД вынесена в серверную часть приложение и использует PostgreSQL/.

В зависимостях проекта присутствует:

```
pg
```

а также TypeScript-типы:

```
@types/pg
```


#### 1.3. Клиентское состояние

Для клиентского состояния используется Zustand:

```
zustand ^5.0.14
```

Также используется:

```
idb-keyval
```

для работы с IndexedDB.

Это позволяет разделить:

```
PostgreSQL
     │
     │ серверные данные
     ▼
 Next.js API
     │
     ▼
 React
     │
     ▼
 Zustand
     │
     ▼
 IndexedDB
```

Таким образом, локальное хранилище может использоваться для ускорения интерфейса и хранения клиентского состояния.

## 2. Технологический стек

|     Компонент     |         Технология         |
| :---------------: | :------------------------: |
|                   |                            |
|     Framework     |       Next.js 16.2.4       |
|        UI         |        React 19.2.4        |
|       Язык        |        TypeScript 5        |
|        CSS        |       Tailwind CSS 4       |
|  CSS integration  |   `@tailwindcss/postcss`   |
|        БД         |         PostgreSQL         |
| PostgreSQL driver |            `pg`            |
|   Client state    |         Zustand 5          |
|     IndexedDB     |        `idb-keyval`        |
|     Анимации      |       Framer Motion        |
|      Иконки       | Lucide React / React Icons |
|     Штрихкоды     |         JsBarcode          |
|   Сканирование    |   react-barcode-scanner    |
|       Даты        |          date-fns          |
|       Файлы       |        Vercel Blob         |
|       Lint        |          ESLint 9          |
|    Deployment     |           Vercel           |
В частности, проект официально настроен как Next.js - приложение и содержит стандартные команды запуска и сборки:

```
npm run dev
npm run build
npm run start
npm run lint
```

## 3. Структура проекта

Текущая структура верхнего уровня:

```
warehouse-management-system/
│
├── .idea/
│
├── app/
│
├── data/
│
├── database/
│
├── public/
│
├── .gitignore
├── AGENTS.md
├── CLAUDE.md
├── README.md
│
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── package-lock.json
├── pnpm-lock.yaml
├── postcss.config.mjs
└── tsconfig.json
```

## 4. Директория `app/`

Это основной каталог приложения.

Текущая структура:

```
app/
│
├── api/
├── atol-local-agent-driver/
├── atol-local-agent/
├── auth/
├── components/
├── deliveries/
├── homePage/
├── hooks/
├── inventory/
├── lib/
├── not-found/
├── online-kassa/
├── otgruzki/
├── priemka/
├── products/
├── purchase/
├── sales/
├── statistics/
├── styles/
├── system/
├── types/
├── utils/
├── writeoff/
│
├── layout.tsx
└── page.tsx
```

#### Назначение основных каталогов

|    Каталог     |            Назначение             |
| :------------: | :-------------------------------: |
|                |                                   |
|     `api`      |      серверные API endpoints      |
|  `components`  | переиспользуемые React-компоненты |
|     `auth`     |            авторизация            |
|   `products`   |         работа с товарами         |
|  `inventory`   |          склад и остатки          |
|   `priemka`    |              приёмка              |
|   `otgruzki`   |             отгрузки              |
|   `purchase`   |              закупки              |
|    `sales`     |              продажи              |
|  `deliveries`  |             доставка              |
| `online-kassa` |           онлайн-касса            |
|  `statistics`  |            статистика             |
|   `writeoff`   |             списание              |
|    `system`    |         системные функции         |
|    `hooks`     |            React hooks            |
|     `lib`      | общие библиотеки/серверная логика |
|    `types`     |          TypeScript-типы          |
|    `utils`     |      вспомогательные функции      |
|    `styles`    |               стили               |
## 5. API-архитектура

API организовано следующим образом:

```
app/api/
│
├── acceptance/
├── deliveries/
├── inventory/
├── locations/
├── products/
├── purchase/
├── sales/
├── shipment/
├── statistics/
└── writeoff/
```

```
Products
   │
   ├── товары
   ├── цены
   ├── штрихкоды
   └── категории

Inventory
   │
   ├── остатки
   ├── склады
   └── движения

Acceptance
   │
   ├── импорт
   ├── сопоставление
   ├── создание товаров
   └── обновление товаров

Shipment
   │
   ├── отгрузка
   ├── списание остатков
   └── документы

Sales
   │
   ├── продажа
   ├── позиции
   └── оплата

Purchase
   │
   └── закупки

Writeoff
   │
   └── списание

Statistics
   │
   └── аналитика
```

## 6. База данных

В репозитории предусмотрен отдельный каталог:

```
database/
├── schema.sql
└── seed.sql
```

`schema.sql` содержит SQL-структуру базы, а `seed.sql` - первоначальные данные.

## 7. Модель данных

На уровне предметной области система выглядит примерно так: 

```
                    ┌──────────────┐
                    │   PRODUCTS   │
                    │              │
                    │ товар        │
                    │ штрихкод     │
                    │ цена         │
                    │ категория    │
                    └──────┬───────┘
                           │
             ┌─────────────┼──────────────┐
             │             │              │
             ▼             ▼              ▼
       ┌──────────┐  ┌─────────────┐  ┌───────────┐
       │ INVENTORY│  │ ACCEPTANCE  │  │  SALES    │
       └────┬─────┘  └──────┬──────┘  └─────┬─────┘
            │               │               │
            ▼               ▼               ▼
       Остатки          Приёмки          Продажи
            │
            ▼
       Движение товара
            │
            ▼
       Отгрузки / списания
```

Это уже позволяет выделить центральную сущность системы - товар, вокруг которого строятся складские операции.

## 8. `app/lib/db.ts` - подключение PostgreSQL

Это базовый файл доступа к БД:

```
app/kib/db.ts
```

В нём создаётся `Pool` из библиотеки `pg`. Подключение берётся из `DATABASE_URL`. Пул ограничен пятью соединениями, `idleTimeoutMillis` составляет 30 секунд, а `connectionTimeoutMillis` - 10 секунд.

Архитектурно: 

```
API Route
   │
   ▼
pool
   │
   ├── PostgreSQL connection #1
   ├── PostgreSQL connection #2
   ├── PostgreSQL connection #3
   ├── PostgreSQL connection #4
   └── PostgreSQL connection #5
```

Есть также защита от создания нескольких пулов при hot reload в development:

```
globalThis
   └── pool
```

В production пул созда1тся непосредственно, а в development сохраняется в `globalThis`.

#### Документация файла

Назначение: единая точка создания PostgreSQL connection pool.

**Зависимости:**

- `pg`
- `DATABASE_URL`

**Используется:** практически всеми серверными API, работающими с БД.

**Важный момент:** здесь нет ORM. SQL-запросы пишутся непосредственно в API/серверной логике.

## 9. `app/lib/serverWarehouseLocation.ts`

Это один из наиболее важных файлов текущей архитектуры.

Он отвечает одновременно за:

- текущую торговую/складскую зону;
- текущего пользователя;
- роль пользователя;
- разрешённые пользователю зоны;
- получение данных из cookies/headers;
- проверку доступа пользователя к зоне.

Файл содержит типы:

```
WarehouseLocation
WarehouseUser
```

`WarehouseLocation`:

```
id
name
slug
type
```

где `type`:

```
warehouse
store
```

`WarehouseUser`:

```
login
name
role
locationSlugs
```

Роли:

```
admin
warehouse
cashier
```

#### 9.1. Зоны

В системе предусмотрен основной склад:

```
main-warehouse
```

а также:

```
tochka
rodnik
```

По умолчанию: 

```
DEFAULT_WAREHOUSE_LOCATION_SLUG = "tochka"
```

Текущая зона может передаваться через:
1. cookie;
2. HTTP header;
3. query-параметр `location`;
4. query-параметр `locationSlug`;
5. значение по умолчанию.

Получается:

```
Request
 │
 ├── Cookie
 ├── Header
 └── Query
       │
       ▼
getWarehouseLocationSlugFromRequest()
       │
       ▼
normalizeWarehouseLocationSlug()
       │
       ▼
locations
       │
       ▼
WarehouseLocation
```

## 10. Пользователи

Существуют роли: 

```
admin
warehouse
cashier
```

и привязка пользователя к зонам.

То есть сейчас это **не полноценная таблица пользователей PostgreSQL**, а статическая конфигурация внутри приложения.

> Авторизация/идентификация пользователя в текущей реализации основана на login + cookies/headers и списке пользователей, определённом в серверном TypeScript-коде.

## 11. Проверка зоны

Функция: 

```
resolveWarehouseLocation()
```

делает запрос:

```
SELECT id, name, slug, type
FROM locations
WHERE slug = $1
  AND is_active = TRUE
LIMIT 1
```

То есть фактическая информация о зоне берётся из PostgreSQL.

Если запрошенная зона не найдена, система пытается использовать `tochka` как fallback.

Если и она отсутствует, возвращается ошибка:

```
Торговая зона не найдена.
Сначала выполните SQL-миграцию locations/product_stocks.
```

## 12. `app/lib/warehouseAccess.ts`

Это матрица доступа к разделам системы.

Файл определяет:

```
WarehouseSection
WarehouseSectionRule
WAREHOUSE_SECTION_RULES
```

Разделы:

```
products
sales
priemka
otgruzki
deliveries
writeoff
inventory
online-kassa
statistics
purchase
```

Правила: 

|     Раздел     |    Доступ     |
| :------------: | :-----------: |
|                |               |
|     Товары     |      все      |
|    Продажи     |   магазины    |
|    Приёмки     |      все      |
|    Отгрузки    |      все      |
|    Доставки    | только ТОЧКА  |
|    Списания    |      все      |
| Инвентаризация |      все      |
|     Касса      |   магазины    |
|   Статистика   | главный склад |
|    Закупка     | главный склад |

## 13. Матрица доступа

В результате архитектура зон выглядит так:

```
                    СИСТЕМА
                       │
          ┌────────────┴────────────┐
          │                         │
     MAIN-WAREHOUSE               STORES
          │                         │
          │                    ┌────┴────┐
          │                    │         │
        ТОЧКА                ТОЧКА     РОДНИК
          │
        РОДНИК
```

Но фактически разрешения вычисляются не по роли напрямую, а по:

```
location.slug
location.type
section
```

Например, `sales` разрешён для любой зоны, которая не является главным складом. `statistics` и `purchase` разрешены только главному складу. `deliveries` - только `tochka`.

## 14. `app/lib/serverWarehouseAccess.ts`

Это серверная обёртка над системой доступа.

Главная функция:

```
requireWarehouseSection()
```

Она выполняет:

```
HTTP Request
     │
     ▼
resolveWarehouseContext()
     │
     ├── определить пользователя
     ├── определить зону
     └── проверить доступ пользователя к зоне
     │
     ▼
canUseWarehouseSection()
     │
     ├── разрешено → context
     │
     └── запрещено → HTTP 403
```

Если пользователь не определён, возвращается `401`.

Если пользователь определён, но не имеет доступа, возвращается `403`.

Необработанная ошибка приводит к `500`.

Это очень важный механизм: API может использовать одну функцию вместо самостоятельной реализации проверки прав в каждом endpoint.

## 15. `app/api/products/route.ts`

Это основной API товаров.

Файл содержит:

```
GET /api/products
POST /api/products
```

#### 15.1. GET `/api/products`

API определяет текущую складскую зону:

```
resolveWarehouseLocation(pool, request)
```

Затем принимает:

```
search
limit
cursor
```

##### Поиск

Если введено число, похожее на штрихкод:

```
1234567890
```

производится поиск по:

```
barcode =
barcode ILIKE
name ILIKE
```

Если введён обычный текст:

```
name ILIKE
barcode ILIKE
category ILIKE
```

#### 15.2. Пагинация 

Здесь уже реализована важная оптимизация

Используется: 

```
limit
cursor
```

а не загрузка всей таблицы.

SQL:

```
ORDER BY p.id DESC
LIMIT limit + 1
```

а при наличии cursor:

```
p.id < cursor
```

Ответ:

```
{
  "items": [],
  "nextCursor": 123,
  "hasMore": true,
  "limit": 50,
  "durationMs": 12,
  "location": {}
}
```

## 16. Особенность остатков товаров

Очень важный момент обнаружился непосредственно в SQL `GET`.

Товар берётся из:

```
products p
```

а остаток - из:

```
product_stocks ps
```

Связь:

```
products.id
      │
      ▼
product_stocks.product_id

product_stocks.location_id
      │
      ▼
текущая зона
```

SQL использует:

```
COALESCE(ps.stock, 0)
```

То есть API показывает остаток конкретного товара именно в текущей зоне.

Это подтверждает, что новая модель склада:

```
products
+
product_stocks
```

является основной архитектурой.

## 17. Создание товара

`POST /api/products` создаёт товар и одновременно создаёт запись его остатка для текущей зоны.

Процесс:

```
POST
 │
 ▼
валидация
 │
 ▼
BEGIN
 │
 ▼
INSERT products
 │
 ▼
INSERT product_stocks
 │
 ▼
если stock != 0
 │
 ▼
INSERT stock_movements
 │
 ▼
SELECT созданный товар
 │
 ▼
COMMIT
```

То есть создание товара - транзакционная операция.

## 18. Штрихкод

Если штрихкод не передан, API генерирует его самостоятельно.

Используется префикс:

```
200
```

и рассчитывается контрольная цифра по алгоритму EAN-13.

Получается:

```
200XXXXXXXXX
```

## 19. Маркировка товара

В `products` уже предусмотрено поле:

```
marked
```

API поддерживает несколько вариантов входного имени:

```
marked
isMarked
is_marked
marking
markedProduct
```

и приводит значение к Boolean.

Также API возвращает:

```
{
  "marked": true,
  "isMarked": true
}
```

Это является фундаментом для дальнейшей интеграции с маркированным товаром.

## 20. `app/api/acceptance/route.ts`

Приёмка сейчас реализована как: 

```
POST /api/acceptance
```

Endpoint принимает массив:

```
items[]
```

Для каждой позиции:

```
productId
quantity
category
purchasePrice
sellingPrice
```

#### 20.1. Алгоритм приёмки

```
POST /api/acceptance
        │
        ▼
Проверка items
        │
        ▼
Проверка каждой позиции
        │
        ▼
BEGIN
        │
        ▼
генерация номера ACC-...
        │
        ▼
SELECT product FOR UPDATE
        │
        ▼
UPDATE products
        │
        ├── stock += quantity
        ├── category
        ├── purchase_price
        └── selling_price
        │
        ▼
COMMIT
```

**Важное архитектурное замечание**

Этот endpoint обновляет `products.stock`, а не `product_stocks`.

Это отличается от более новой логики `products` API и `shipment/sales`, где остатки работают через `product_stocks`.

Это означает, что в проекте сейчас присутствует переходная/совместимая архитектура остатков:

```
Новая модель:
product_stocks.stock

Старая модель:
products.stock
```

## 21. `app/api/shipment/route.ts`

Отгрузка - значительно более сложная операция.

Она работает с:

```
product_shipments
product_shipment_items
product_stocks
locations
products
```

и выполняется внутри транзакции.

#### 21.1. Общая схема

```
ЗОНА-ОТПРАВИТЕЛЬ
       │
       │ shipment
       ▼
ЗОНА-ПОЛУЧАТЕЛЬ
```

Например: 

```
Главный склад
      │
      │ 20 шт.
      ▼
ТОЧКА
```

#### 21.2. Создание документа

Сначала определяется:

```
fromLocation
toLocation
user
```

Нельзя отправить товар в ту же зону:

```
fromLocation.id === toLocation.id
```

Создаётся запись `product_shipments`.

Затем генерируется: 

```
TRF-YYYYMMDD-XXXXXX
```

и:

```
DOC-TRF-XXXXXXXX
```

где второй идентификатор является transfer barcode.

## 22. Блокировка остатков при отгрузке

Перед изменением остатка используется:

```
FOR UPDATE OF p, ps
```

Он защищает от ситуации:

```
Запрос A читает stock = 10
Запрос B читает stock = 10

A списывает 7
B списывает 7

результат = -4
```

Вместо этого PostgreSQL блокирует строку до завершения транзакции.

Таким образом:

```
transaction
   │
   ▼
SELECT ... FOR UPDATE
   │
   ▼
проверка stock
   │
   ▼
UPDATE
```

## 23. Контроль недостаточного остатка

Перед списанием:

```
previousStock < quantity
```

вызывает ошибку.

Например:

```
Недостаточно остатка:
Товар X.
Доступно: 5
Требуется: 7
```

После этого транзакция откатывается.

## 24. Legacy-синхронизация

Особенно интересная часть:

```
syncLegacyTochkaStock()
```

Если зона: 

```
tochka
```

то новое значение: 

```
product_stocks.stock
```

копируется также в:

```
products.stock
```

Получается:

```
product_stocks
       │
       │ Tochka
       ▼
products.stock
```

Это явно показывает, что `products.stock` сейчас поддерживается ради совместимости со старой логикой.

## 25. `app/api/sales/route.ts`

Продажи используют новую модель складских остатков.

Поддерживаемые способы оплаты:

```
card
cash
transfer
```

#### 25.1. GET `/api/sales`

API получает чеки только текущей зоны:

```
WHERE r.location_id = $1
```

и возвращает:

```
receiptNumber
createdAt
paymentMethod
paymentLabel
total
receivedAmount
change
items
cashierName
cashierLogin
locationName
locationSlug
```

## 26. Создание продажи

Алгоритм:

```
POST /api/sales
        │
        ▼
проверка чека
        │
        ▼
проверка способа оплаты
        │
        ▼
BEGIN
        │
        ▼
requireWarehouseSection('sales')
        │
        ▼
получение товара
        │
        ▼
FOR UPDATE
        │
        ▼
проверка остатка
        │
        ▼
UPDATE product_stocks
        │
        ▼
stock_movements
        │
        ▼
создание receipt
        │
        ▼
COMMIT
```

## 27. Особенность весового товара

В продаже существует отдельная логика:

```
unit === weight
```

Весовой товар может уйти в отрицательный остаток, в отличии от обычного штучного товара.

То есть:

```
piece
  stock < quantity
  → ошибка

weight
  stock < quantity
  → допускается
```

## 28. Локальные черновики

Есть два отдельных менеджера состояния:

```
app/lib/acceptanceStateManager.ts
app/lib/shipmentStateManager.ts
```

Оба работают:

```
Zustand
   +
IndexedDB
```

через `idb-keyval`

#### 28.1. Приёмка

Для приёмки существуют отдельные ключи:

```
warehouse.acceptance.page.draft.v2
warehouse.acceptance.modal.draft.v2
warehouse.movement.acceptance.draft.v2
warehouse.movement.shipment.draft.v2
```

Версия хранилища: 

```
2
```

#### 28.2. Отгрузка

```
warehouse.shipment.page.draft.v1
warehouse.shipment.modal.draft.v1
```

Версия:

```
1
```

## 29. Зачем здесь IndexedDB

Схема:

```
Пользователь вводит данные
        │
        ▼
Zustand Store
        │
        ▼
persist()
        │
        ▼
IndexedDB
```

Поэтому при:

- случайном обновлении страницы;
- закрытии вкладки;
- переходе между страницами;

черновик может сохраниться.

При этом БД PostgreSQL **не содержит незавершённый черновик**.

Это принципиально:

```
Черновик
→ IndexedDB

Завершённая операция
→ PostgreSQL
```

## 30. Текущая архитектурная картина

```
                         ┌───────────────┐
                         │   Next.js     │
                         │   App Router  │
                         └───────┬───────┘
                                 │
                 ┌───────────────┴───────────────┐
                 │                               │
           UI / Components                    API Routes
                 │                               │
                 │                 ┌─────────────┼─────────────┐
                 │                 │             │             │
                 │             products      sales        shipment
                 │                 │             │             │
                 │                 └─────────────┼─────────────┘
                 │                               │
                 │                         Access Layer
                 │                               │
                 │                  ┌────────────┴───────────┐
                 │                  │                        │
                 │          Warehouse Context          Permissions
                 │                  │                        │
                 └──────────────────┴────────────────────────┘
                                    │
                                    ▼
                               PostgreSQL
                                    │
               ┌────────────────────┼─────────────────────┐
               │                    │                     │
           products           product_stocks        locations
               │                    │                     │
               │                    ├── stock             │
               │                    │                     │
               ▼                    ▼                     ▼
          товарная                 остатки             зоны
          сущность
               │
               ├──────────────┐
               │              │
               ▼              ▼
          shipments        sales
               │              │
               ▼              ▼
       stock_movements     receipts
```