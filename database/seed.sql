INSERT INTO products
(name, category, barcode, purchase_price, selling_price, unit, stock, min_stock, image)
VALUES
('Макароны', 'Бакалея', '4601234567890', 85, 110, 'piece', 45, 10, 'https://i.pinimg.com/736x/11/6a/2b/116a2b68ea33003c15614ca669a22a25.jpg'),
('Рис', 'Бакалея', '4601234567891', 65, 84, 'weight', 12.5, 5, 'https://i.pinimg.com/736x/11/6a/2b/116a2b68ea33003c15614ca669a22a25.jpg'),
('Гречка', 'Бакалея', '4601234567892', 75, 97, 'weight', 3.2, 5, 'https://i.pinimg.com/736x/11/6a/2b/116a2b68ea33003c15614ca669a22a25.jpg'),
('Водка', 'Алкоголь', '4601234567893', 300, 390, 'piece', 28, 15, 'https://i.pinimg.com/736x/11/6a/2b/116a2b68ea33003c15614ca669a22a25.jpg'),
('Пиво светлое', 'Алкоголь', '4601234567894', 60, 81, 'piece', 150, 50, 'https://i.pinimg.com/736x/11/6a/2b/116a2b68ea33003c15614ca669a22a25.jpg'),
('Вино', 'Алкоголь', '4601234567895', 380, 494, 'piece', 8, 10, 'https://i.pinimg.com/736x/11/6a/2b/116a2b68ea33003c15614ca669a22a25.jpg'),
('Winston', 'Сигареты', '4601234567896', 120, 156, 'piece', 0, 20, 'https://i.pinimg.com/736x/11/6a/2b/116a2b68ea33003c15614ca669a22a25.jpg'),
('Camel', 'Сигареты', '4601234567897', 130, 169, 'piece', 35, 20, 'https://i.pinimg.com/736x/11/6a/2b/116a2b68ea33003c15614ca669a22a25.jpg'),
('Мальборо', 'Сигареты', '4601234567898', 140, 182, 'piece', 42, 20, 'https://i.pinimg.com/736x/11/6a/2b/116a2b68ea33003c15614ca669a22a25.jpg'),
('Сахар', 'Бакалея', '4601234567899', 50, 65, 'weight', 25.8, 10, 'https://i.pinimg.com/736x/11/6a/2b/116a2b68ea33003c15614ca669a22a25.jpg')
ON CONFLICT (barcode) DO NOTHING;