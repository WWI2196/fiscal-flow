'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from './ui/card';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent
} from "@/components/ui/chart";
import {
  Building2, ShoppingBag, TrendingUp, ChevronsUpDown, Store, Zap, ChevronRight, ChevronDown,
  EqualSquare as CompareIcon, Calendar, Filter
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip,
  Legend, Cell
} from 'recharts';
import { format, parseISO, isValid, subDays, subMonths, subYears, isWithinInterval, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollArea } from './ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { DateRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';

// Types
type Expense = {
  id: string; accountId: string; amount: number; category: string; date: Date | string; description: string;
};

interface MerchantAnalyticsProps {
  expenses: Expense[];
}

// Time period types
type TimePeriod = '7d' | '30d' | '90d' | '6m' | '1y' | 'ytd' | 'custom';

export function MerchantAnalytics({ expenses }: MerchantAnalyticsProps) {
  const [expanded, setExpanded] = useState<boolean>(false);
  const [sortType, setSortType] = useState<'amount' | 'frequency'>('amount');
  const [selectedMerchant, setSelectedMerchant] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState<boolean>(false);
  const [showGuide, setShowGuide] = useState<boolean>(true);
  const [showMerchantInput, setShowMerchantInput] = useState<boolean>(false);
  const [manualMerchant, setManualMerchant] = useState<string>('');
  const [manualCategory, setManualCategory] = useState<string>('');
  const [selectedTimePeriod, setSelectedTimePeriod] = useState<TimePeriod>('30d');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Store the showGuide state in localStorage to only show it on first use
  useEffect(() => {
    const hasSeenGuide = localStorage.getItem('merchant-analytics-guide-seen');
    if (hasSeenGuide) {
      setShowGuide(false);
    }
  }, []);

  const dismissGuide = () => {
    setShowGuide(false);
    localStorage.setItem('merchant-analytics-guide-seen', 'true');
  };

  const barChartRef = useRef<HTMLDivElement>(null);
  const comparisonRef = useRef<HTMLDivElement>(null);

  // Get date range based on selected time period
  const getDateRangeFromPeriod = (period: TimePeriod): [Date, Date] => {
    const today = new Date();
    
    switch (period) {
      case '7d':
        return [subDays(today, 7), today];
      case '30d':
        return [subDays(today, 30), today];
      case '90d':
        return [subDays(today, 90), today];
      case '6m':
        return [subMonths(today, 6), today];
      case '1y':
        return [subYears(today, 1), today];
      case 'ytd':
        return [startOfYear(today), today];
      case 'custom':
        return dateRange ? [dateRange.from as Date, dateRange.to as Date] : [subDays(today, 30), today];
      default:
        return [subDays(today, 30), today];
    }
  };

  // Process merchants and their transactions
  const merchantData = useMemo(() => {
    if (expenses.length === 0) return [];
    
    const [startDate, endDate] = getDateRangeFromPeriod(selectedTimePeriod);
    
    const merchantMap = new Map<string, {
      merchant: string;
      totalSpent: number;
      transactions: number;
      avgAmount: number;
      categories: Map<string, number>;
      dates: Date[];
      categoryBreakdown?: { name: string; value: number }[];
    }>();
    
    expenses.forEach(expense => {
      // Extract merchant name from description
      // This is a simple extraction - in production, you'd want a more robust approach
      const descriptionParts = expense.description?.split(' - ');
      let merchant = descriptionParts?.[0] || 'Unknown';
      
      // Clean up merchant name
      merchant = merchant.trim();
      if (merchant === '') merchant = 'Unknown';

      // Convert date to Date object if it's not already
      let expenseDate: Date;
      if (expense.date instanceof Date) {
        expenseDate = expense.date;
      } else if (typeof expense.date === 'string') {
        expenseDate = parseISO(expense.date);
        if (!isValid(expenseDate)) expenseDate = new Date();
      } else {
        expenseDate = new Date();
      }

      // Filter by date range
      if (!isWithinInterval(expenseDate, { start: startDate, end: endDate })) {
        return;
      }

      // Filter by category if one is selected
      if (selectedCategory && expense.category !== selectedCategory) {
        return;
      }

      // Update merchant data
      const existingData = merchantMap.get(merchant) || {
        merchant,
        totalSpent: 0,
        transactions: 0,
        avgAmount: 0,
        categories: new Map<string, number>(),
        dates: []
      };

      existingData.totalSpent += expense.amount;
      existingData.transactions += 1;
      existingData.dates.push(expenseDate);
      
      // Update category breakdown
      const currentCategoryAmount = existingData.categories.get(expense.category) || 0;
      existingData.categories.set(expense.category, currentCategoryAmount + expense.amount);
      
      merchantMap.set(merchant, existingData);
    });

    // Calculate average amounts and prepare category breakdown for chart
    const result = Array.from(merchantMap.values()).map(data => {
      data.avgAmount = data.totalSpent / data.transactions;
      
      // Convert category map to array for visualization
      data.categoryBreakdown = Array.from(data.categories.entries()).map(([name, value]) => ({
        name,
        value
      }));
      
      return data;
    });

    // Sort by total amount spent
    return result.sort((a, b) => b.totalSpent - a.totalSpent);
  }, [expenses, selectedTimePeriod, dateRange, selectedCategory]);

  // Top merchants (limited to 10 for display)
  const topMerchants = useMemo(() => {
    if (sortType === 'amount') {
      return merchantData.sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10);
    } else {
      return merchantData.sort((a, b) => b.transactions - a.transactions).slice(0, 10);
    }
  }, [merchantData, sortType]);

  // Extract all unique categories
  const allCategories = useMemo(() => {
    const categories = new Set<string>();
    merchantData.forEach(merchant => {
      Array.from(merchant.categories.keys()).forEach(category => {
        categories.add(category);
      });
    });
    return Array.from(categories).sort();
  }, [merchantData]);

  // Generate merchant comparison data with category filtering
  const comparisonData = useMemo(() => {
    if (!selectedMerchant) return null;
    
    const merchant = merchantData.find(m => m.merchant === selectedMerchant);
    if (!merchant) return null;
    
    // Get merchant's categories
    const categories = Array.from(merchant.categories.keys());
    
    // Find similar merchants based on common categories or selected category
    const similarMerchants = merchantData.filter(m => {
      if (m.merchant === selectedMerchant) return false;
      
      // Check if there's category overlap or if we're filtering by a specific category
      const merchantCategories = Array.from(m.categories.keys());
      
      if (selectedCategory) {
        return merchantCategories.includes(selectedCategory) && categories.includes(selectedCategory);
      }
      
      return categories.some(category => merchantCategories.includes(category));
    }).slice(0, 3); // Limit to top 3 similar merchants

    // Generate comparison data
    const result = {
      merchant: selectedMerchant,
      avgAmount: merchant.avgAmount,
      similarMerchants: similarMerchants.map(m => {
        // Calculate price difference based on the selected category or overall
        let thisMerchantAmount = merchant.avgAmount;
        let otherMerchantAmount = m.avgAmount;
        
        // If we're comparing by category, use the category-specific amounts
        if (selectedCategory) {
          const thisCategoryAmount = merchant.categories.get(selectedCategory) || 0;
          const thisTransactions = merchant.dates.length;
          thisMerchantAmount = thisCategoryAmount / thisTransactions;
          
          const otherCategoryAmount = m.categories.get(selectedCategory) || 0;
          const otherTransactions = m.dates.length;
          otherMerchantAmount = otherCategoryAmount / otherTransactions;
        }
        
        return {
          name: m.merchant,
          avgAmount: otherMerchantAmount,
          priceDiff: ((otherMerchantAmount - thisMerchantAmount) / thisMerchantAmount * 100).toFixed(1)
        };
      })
    };

    return result;
  }, [selectedMerchant, merchantData, selectedCategory]);

  // Simulate price insight for specific merchant
  const priceInsight = useMemo(() => {
    if (!comparisonData) return null;
    
    // Generate insight based on comparison
    const lowerPriced = comparisonData.similarMerchants.filter(m => parseFloat(m.priceDiff) < 0);
    const higherPriced = comparisonData.similarMerchants.filter(m => parseFloat(m.priceDiff) > 0);
    
    const categoryText = selectedCategory ? ` for ${selectedCategory}` : '';
    
    if (lowerPriced.length > higherPriced.length) {
      return {
        text: `${comparisonData.merchant} is generally more expensive${categoryText} than similar merchants.`,
        type: 'negative'
      };
    } else if (higherPriced.length > lowerPriced.length) {
      return {
        text: `${comparisonData.merchant} offers good value${categoryText} compared to similar merchants.`,
        type: 'positive'
      };
    } else {
      return {
        text: `${comparisonData.merchant} prices${categoryText} are average compared to similar merchants.`,
        type: 'neutral'
      };
    }
  }, [comparisonData, selectedCategory]);

  // Prepare chart data
  const chartData = useMemo(() => {
    return topMerchants.map((merchant) => ({
      name: merchant.merchant,
      total: parseFloat(merchant.totalSpent.toFixed(2)),
      transactions: merchant.transactions,
      avg: parseFloat(merchant.avgAmount.toFixed(2))
    }));
  }, [topMerchants]);

  // Animate comparison section when shown
  useEffect(() => {
    if (showComparison && comparisonRef.current) {
      gsap.fromTo(
        comparisonRef.current,
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
      );
    }
  }, [showComparison]);

  // Handle merchant selection
  const handleMerchantSelect = (merchant: string) => {
    setSelectedMerchant(merchant === selectedMerchant ? null : merchant);
    setShowComparison(merchant !== selectedMerchant);
  };

  // Handle time period selection
  const handleTimePeriodChange = (period: TimePeriod) => {
    setSelectedTimePeriod(period);
  };

  // Handle date range change for custom period
  const handleDateRangeChange = (range: DateRange | undefined) => {
    if (range) {
      setDateRange(range);
      setSelectedTimePeriod('custom');
    }
  };

  return (
    <Card className="border-0 shadow-sm bg-white/80 dark:bg-[#2C2C2E]/80 backdrop-blur-md flex flex-col rounded-2xl overflow-hidden hover:shadow-md transition-all duration-200">
      <CardHeader className="pb-2 border-b border-[#F2F2F7] dark:border-[#38383A]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[#EDF4FE] dark:bg-[#1C3049] rounded-full">
              <Store className="h-4 w-4 text-[#007AFF] dark:text-[#0A84FF]" />
            </div>
            <CardTitle className="text-base font-semibold text-[#1D1D1F] dark:text-white">
              Merchant Analytics
            </CardTitle>
          </div>
          <Button 
            onClick={() => setExpanded(!expanded)} 
            size="sm" 
            variant="ghost" 
            className="h-8 w-8 p-0 rounded-full"
          >
            {expanded ? 
              <ChevronDown className="h-4 w-4 text-[#8E8E93] dark:text-[#98989D]" /> : 
              <ChevronRight className="h-4 w-4 text-[#8E8E93] dark:text-[#98989D]" />
            }
          </Button>
        </div>
        <CardDescription className="text-xs text-[#8E8E93] dark:text-[#98989D] mt-1">
          {expanded ? 'Compare prices and spending patterns across merchants' : 'Analyze your spending by merchant and find better deals'}
        </CardDescription>
      </CardHeader>
      
      <CardContent className={`p-0 pt-2 ${expanded ? 'pb-4' : 'pb-2'} transition-all duration-300`}>
        {showGuide && (
          <div className="px-4 py-2 bg-[#F9F9FB] dark:bg-[#28282A] rounded-xl mb-4">
            <h3 className="text-sm font-medium text-[#1D1D1F] dark:text-white mb-2">
              How to Use Merchant Analytics
            </h3>
            <p className="text-xs text-[#8E8E93] dark:text-[#98989D] mb-2">
              Add transactions with merchant details to analyze your spending patterns and compare prices across merchants.
            </p>
            <ol className="text-xs pl-4 list-decimal text-[#8E8E93] dark:text-[#98989D] mb-2 space-y-1">
              <li>Format descriptions as: <span className="font-medium text-[#1D1D1F] dark:text-white">Merchant Name - Details</span></li>
              <li>Example: "Cafe Luna - Lunch" or "QuickFill - Gas"</li>
              <li>Use consistent merchant names for better comparisons</li>
            </ol>
            <Button 
              variant="link" 
              size="sm" 
              onClick={dismissGuide} 
              className="text-[#007AFF] dark:text-[#0A84FF] text-xs font-medium"
            >
              Got it!
            </Button>
          </div>
        )}

        {/* Manual Merchant Entry Option */}
        <div className="px-4 pb-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMerchantInput(!showMerchantInput)}
            className="text-xs w-full mb-3 flex items-center justify-center gap-1 border-dashed border-[#DADADC] dark:border-[#48484A]"
          >
            {showMerchantInput ? "Hide Manual Entry" : "Add Merchant Manually (Optional)"}
          </Button>
          
          {showMerchantInput && (
            <div className="bg-[#F9F9FB] dark:bg-[#28282A] rounded-xl p-3 mb-3 animate-fadeIn">
              <h3 className="text-sm font-medium text-[#1D1D1F] dark:text-white mb-2">
                Manual Merchant Entry
              </h3>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-[#8E8E93] dark:text-[#98989D] block mb-1">
                    Merchant Name
                  </label>
                  <input
                    type="text"
                    value={manualMerchant}
                    onChange={(e) => setManualMerchant(e.target.value)}
                    placeholder="e.g., Cafe Luna"
                    className="w-full text-xs py-2 px-3 rounded-lg border border-[#DADADC] dark:border-[#48484A] bg-white/70 dark:bg-[#3A3A3C]/70"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8E8E93] dark:text-[#98989D] block mb-1">
                    Category
                  </label>
                  <select
                    value={manualCategory}
                    onChange={(e) => setManualCategory(e.target.value)}
                    className="w-full text-xs py-2 px-3 rounded-lg border border-[#DADADC] dark:border-[#48484A] bg-white/70 dark:bg-[#3A3A3C]/70"
                  >
                    <option value="">Select category...</option>
                    <option value="Coffee">Coffee</option>
                    <option value="Dining Out">Dining Out</option>
                    <option value="Groceries">Groceries</option>
                    <option value="Transport">Transport</option>
                    <option value="Shopping">Shopping</option>
                    <option value="Entertainment">Entertainment</option>
                    <option value="Utilities">Utilities</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <Button
                  size="sm"
                  className="w-full text-xs bg-[#007AFF] hover:bg-[#0071E3] text-white mt-1"
                >
                  Add to Analytics
                </Button>
                <p className="text-[11px] text-[#8E8E93] dark:text-[#98989D] mt-1">
                  Note: Manual entries will be stored locally for merchant analytics.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Time Period Selection and Category Filter */}
        <div className="px-4 pb-3 flex items-center gap-2">
          <Select
            value={selectedTimePeriod}
            onValueChange={(value) => handleTimePeriodChange(value as TimePeriod)}
          >
            <SelectTrigger className="h-8 text-xs w-[110px]">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  {selectedTimePeriod === '7d' ? '7 days' : 
                   selectedTimePeriod === '30d' ? '30 days' : 
                   selectedTimePeriod === '90d' ? '90 days' : 
                   selectedTimePeriod === '6m' ? '6 months' : 
                   selectedTimePeriod === '1y' ? '1 year' : 
                   selectedTimePeriod === 'ytd' ? 'Year to date' : 
                   'Custom'}
                </span>
              </div>
            </SelectTrigger>
            <SelectContent className="min-w-[150px]">
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="6m">Last 6 months</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
              <SelectItem value="ytd">Year to date</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>

          {selectedTimePeriod === 'custom' && (
            <div className="flex-1">
              <DateRangePicker
                value={dateRange}
                onChange={handleDateRangeChange}
                classNames={{
                  trigger: "h-8 text-xs",
                }}
              />
            </div>
          )}
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 px-2 text-xs">
                <Filter className="h-3.5 w-3.5 mr-1" />
                {selectedCategory ? selectedCategory : "All Categories"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-2" align="end">
              <div className="space-y-1">
                <Button 
                  variant={selectedCategory === null ? "default" : "outline"}
                  size="sm"
                  className="w-full justify-start text-xs h-7"
                  onClick={() => setSelectedCategory(null)}
                >
                  All Categories
                </Button>
                {allCategories.map(category => (
                  <Button
                    key={category}
                    variant={selectedCategory === category ? "default" : "outline"}
                    size="sm"
                    className="w-full justify-start text-xs h-7"
                    onClick={() => setSelectedCategory(category)}
                  >
                    {category}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="px-4 pb-2 flex items-center justify-between">
          <div className="flex space-x-2">
            <Badge 
              variant={sortType === 'amount' ? 'default' : 'outline'} 
              className={`rounded-full text-xs cursor-pointer ${sortType === 'amount' ? 'bg-[#007AFF] hover:bg-[#0071E3]' : 'hover:bg-[#F2F2F7] dark:hover:bg-[#38383A]'}`}
              onClick={() => setSortType('amount')}
            >
              By Amount
            </Badge>
            <Badge 
              variant={sortType === 'frequency' ? 'default' : 'outline'}
              className={`rounded-full text-xs cursor-pointer ${sortType === 'frequency' ? 'bg-[#007AFF] hover:bg-[#0071E3]' : 'hover:bg-[#F2F2F7] dark:hover:bg-[#38383A]'}`}
              onClick={() => setSortType('frequency')}
            >
              By Frequency
            </Badge>
          </div>
          <div className="text-xs text-[#8E8E93] dark:text-[#98989D]">
            {topMerchants.length} Merchants
          </div>
        </div>
        
        <div ref={barChartRef} className={`px-4 ${expanded ? 'h-[270px]' : 'h-[180px]'}`}>
          {merchantData.length > 0 ? (
            <ChartContainer 
              className="w-full h-full"
              config={{
                total: { 
                  label: "Total Spent",
                  color: "#007AFF"
                },
                transactions: { 
                  label: "Number of Transactions",
                  color: "#007AFF"
                },
                avg: { 
                  label: "Average Transaction",
                  color: "#FF9500"
                }
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 15, right: 10, left: -15, bottom: 0 }}
                  barSize={16}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis 
                    dataKey="name" 
                    tickLine={false} 
                    axisLine={false} 
                    tick={{ fontSize: 10 }}
                    interval={0}
                    height={60}
                    tickMargin={5}
                    angle={-45}
                    textAnchor="end"
                  />
                  <YAxis 
                    tickLine={false} 
                    axisLine={false} 
                    fontSize={10}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <RechartsTooltip
                    cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white dark:bg-[#2C2C2E] shadow-lg rounded-lg p-2 border border-[#E5E5EA] dark:border-[#48484A] text-xs">
                            <p className="font-medium text-[#1D1D1F] dark:text-white mb-1">{label}</p>
                            <p className="text-[#007AFF]">Total: ${payload[0].value}</p>
                            <p className="text-[#34C759]">Transactions: {payload[0].payload.transactions}</p>
                            <p className="text-[#FF9500]">Avg: ${payload[0].payload.avg}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar 
                    dataKey={sortType === 'amount' ? "total" : "transactions"} 
                    fill="#007AFF"
                    radius={[4, 4, 0, 0]}
                    onClick={(data) => handleMerchantSelect(data.name)}
                  >
                    {chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`}
                        fill={entry.name === selectedMerchant ? '#FF9500' : '#007AFF'}
                        cursor="pointer"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-[#8E8E93] dark:text-[#98989D] text-sm">
              <div className="text-center">
                <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-60" />
                <p>Add transactions with merchant details to see analytics</p>
              </div>
            </div>
          )}
        </div>

        {/* Merchant Comparison Section - Only visible when expanded and merchant is selected */}
        <AnimatePresence>
          {expanded && showComparison && selectedMerchant && comparisonData && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-4 px-4"
            >
              <div ref={comparisonRef} className="bg-[#F9F9FB] dark:bg-[#28282A] rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CompareIcon className="h-4 w-4 text-[#007AFF] dark:text-[#0A84FF]" />
                    <h3 className="text-sm font-medium text-[#1D1D1F] dark:text-white">
                      {selectedCategory ? `${selectedCategory} Price Comparison` : 'Price Comparison'}
                    </h3>
                  </div>
                  <Badge 
                    className={`
                      text-xs font-medium px-2
                      ${priceInsight?.type === 'positive' ? 'bg-[#E1F8EA] text-[#34C759] dark:bg-[#0C372A] dark:text-[#30D158]' : 
                        priceInsight?.type === 'negative' ? 'bg-[#FEF1F0] text-[#FF3B30] dark:bg-[#3A1D1B] dark:text-[#FF453A]' : 
                        'bg-[#F2F2F7] text-[#8E8E93] dark:bg-[#38383A] dark:text-[#98989D]'}
                    `}
                  >
                    {priceInsight?.type === 'positive' ? 'Good Value' : 
                      priceInsight?.type === 'negative' ? 'Expensive' : 'Average'}
                  </Badge>
                </div>

                <p className="text-xs text-[#1D1D1F] dark:text-white mb-3">
                  {priceInsight?.text}
                </p>

                <h4 className="text-xs font-medium text-[#8E8E93] dark:text-[#98989D] mb-2">
                  {selectedCategory ? `Similar Merchants (${selectedCategory})` : 'Similar Merchants'}
                </h4>
                
                <ScrollArea className="max-h-40">
                  <div className="space-y-2">
                    {comparisonData.similarMerchants.map((merchant, index) => (
                      <div 
                        key={index} 
                        className="flex items-center justify-between p-2 bg-white dark:bg-[#2C2C2E] rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <Store className="h-3.5 w-3.5 text-[#8E8E93] dark:text-[#98989D]" />
                          <span className="text-xs font-medium text-[#1D1D1F] dark:text-white">
                            {merchant.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#8E8E93] dark:text-[#98989D]">
                            ${merchant.avgAmount.toFixed(2)} avg
                          </span>
                          
                          <Badge className={`
                            text-xs px-1.5 py-0
                            ${parseFloat(merchant.priceDiff) < 0 ? 
                              'bg-[#E1F8EA] text-[#34C759] dark:bg-[#0C372A] dark:text-[#30D158]' : 
                              'bg-[#FEF1F0] text-[#FF3B30] dark:bg-[#3A1D1B] dark:text-[#FF453A]'}
                          `}>
                            {parseFloat(merchant.priceDiff) < 0 ? '↓' : '↑'} {Math.abs(parseFloat(merchant.priceDiff))}%
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expand/Collapse button for non-expanded state */}
        {!expanded && (
          <div className="flex justify-center mt-1">
            <Button 
              variant="link" 
              size="sm" 
              onClick={() => setExpanded(true)} 
              className="text-[#007AFF] dark:text-[#0A84FF] text-xs font-medium"
            >
              Compare merchants <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}