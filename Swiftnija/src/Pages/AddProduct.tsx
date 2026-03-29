import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

const AddProduct = () => {
  const [name, setName]               = useState<string>('');
  const [price, setPrice]             = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [loading, setLoading]         = useState<boolean>(false);
  const [error, setError]             = useState<string>('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      setError('Please log in first');
      return;
    }
    if (!name.trim() || !price.trim()) {
      setError('Name and price are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await addDoc(collection(db, 'products'), {
        name:        name.trim(),
        price:       Number(price.trim()),
        description: description.trim(),
        vendorId:    auth.currentUser.uid,
        status:      'active',
        stock:       0,
        sales:       0,
        img:         'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=200&q=80',
        category:    'Other',
        createdAt:   serverTimestamp(),
      });
      alert('Product added successfully!');
      navigate('/vendor');
    } catch (err: any) {
      setError('Failed to add product: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">Add New Product</h2>
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Product Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full border rounded-md p-2"
            placeholder="e.g. Fresh Tomatoes"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Price (₦)</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1 block w-full border rounded-md p-2"
            placeholder="e.g. 500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block w-full border rounded-md p-2"
            rows={3}
            placeholder="Fresh from farm, 1kg pack..."
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 text-white py-2 rounded-md hover:bg-orange-600 disabled:opacity-50"
        >
          {loading ? 'Adding...' : 'Add Product'}
        </button>
      </form>
    </div>
  );
};

export default AddProduct;