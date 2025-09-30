-- Create products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  image_url TEXT NOT NULL,
  specs JSONB DEFAULT '{}'::JSONB,
  category TEXT NOT NULL,
  rating NUMERIC(2, 1) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access (marketplace is public)
CREATE POLICY "Products are viewable by everyone" 
ON public.products 
FOR SELECT 
USING (true);

-- Create index for faster category filtering
CREATE INDEX idx_products_category ON public.products(category);

-- Create index for faster price filtering
CREATE INDEX idx_products_price ON public.products(price);

-- Insert sample products
INSERT INTO public.products (name, description, price, image_url, category, rating, specs) VALUES
('Wireless Noise-Cancelling Headphones', 'Premium over-ear headphones with active noise cancellation, 30-hour battery life, and studio-quality sound.', 299.99, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800', 'Electronics', 4.8, '{"color": "black", "battery": "30 hours", "connectivity": "Bluetooth 5.0", "weight": "250g"}'::jsonb),
('Smart Fitness Watch', 'Advanced fitness tracker with heart rate monitoring, GPS, sleep tracking, and 7-day battery life.', 249.99, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800', 'Electronics', 4.6, '{"display": "1.4 inch AMOLED", "waterproof": "5ATM", "sensors": "Heart rate, GPS, SpO2", "battery": "7 days"}'::jsonb),
('Ergonomic Office Chair', 'Premium mesh office chair with lumbar support, adjustable armrests, and tilt mechanism for all-day comfort.', 399.99, 'https://images.unsplash.com/photo-1580480055273-228ff5388ef8?w=800', 'Furniture', 4.7, '{"material": "Mesh & Aluminum", "weight_capacity": "150kg", "adjustable": "Height, armrests, tilt", "warranty": "5 years"}'::jsonb),
('Stainless Steel Water Bottle', 'Insulated 32oz water bottle that keeps drinks cold for 24 hours or hot for 12 hours. BPA-free and leak-proof.', 34.99, 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800', 'Home & Kitchen', 4.9, '{"capacity": "32oz (946ml)", "material": "Stainless steel", "insulation": "Double-wall vacuum", "features": "Leak-proof, BPA-free"}'::jsonb),
('Mechanical Gaming Keyboard', 'RGB backlit mechanical keyboard with hot-swappable switches, programmable keys, and aluminum frame.', 159.99, 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800', 'Electronics', 4.5, '{"switches": "Hot-swappable mechanical", "lighting": "Per-key RGB", "connectivity": "USB-C, wireless", "layout": "Full-size"}'::jsonb),
('Yoga Mat Premium', 'Extra-thick 6mm yoga mat with non-slip surface, alignment lines, and carrying strap. Eco-friendly TPE material.', 49.99, 'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=800', 'Sports', 4.4, '{"thickness": "6mm", "material": "TPE eco-friendly", "size": "72 x 24 inches", "features": "Non-slip, alignment lines"}'::jsonb),
('Coffee Maker Deluxe', 'Programmable coffee maker with built-in grinder, thermal carafe, and brew strength control. Makes 12 cups.', 179.99, 'https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=800', 'Home & Kitchen', 4.7, '{"capacity": "12 cups", "features": "Built-in grinder, programmable timer", "carafe": "Thermal stainless steel", "warranty": "2 years"}'::jsonb),
('Leather Laptop Bag', 'Professional leather messenger bag with padded laptop compartment (fits up to 15.6"), multiple pockets, and adjustable strap.', 129.99, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800', 'Accessories', 4.6, '{"material": "Genuine leather", "laptop_size": "Up to 15.6 inches", "pockets": "Multiple organized compartments", "color": "Brown"}'::jsonb),
('Smart Home Speaker', 'Voice-controlled smart speaker with 360° sound, built-in voice assistant, and smart home integration.', 99.99, 'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=800', 'Electronics', 4.3, '{"audio": "360° sound", "voice_assistant": "Built-in", "connectivity": "Wi-Fi, Bluetooth", "smart_home": "Compatible with major platforms"}'::jsonb),
('Running Shoes Pro', 'Lightweight running shoes with responsive cushioning, breathable mesh upper, and durable rubber outsole.', 139.99, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800', 'Sports', 4.8, '{"weight": "240g (size 9)", "cushioning": "Responsive foam", "upper": "Engineered mesh", "use": "Road running"}'::jsonb),
('Portable Bluetooth Speaker', 'Waterproof portable speaker with 20-hour battery, 360° sound, and built-in power bank. Perfect for outdoor adventures.', 79.99, 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800', 'Electronics', 4.5, '{"battery": "20 hours", "waterproof": "IP67", "features": "360° sound, power bank", "connectivity": "Bluetooth 5.0"}'::jsonb),
('Standing Desk Converter', 'Adjustable height desk converter that transforms any desk into a standing desk. Holds dual monitors and laptop.', 249.99, 'https://images.unsplash.com/photo-1595515106969-1ce29566ff1c?w=800', 'Furniture', 4.4, '{"height_range": "4.5 to 19.7 inches", "capacity": "35 lbs", "surface": "26 x 20 inches", "features": "Dual monitor support"}'::jsonb);