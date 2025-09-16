'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

interface BarChartProps {
  data: Array<{ label: string; value: number; color?: string }>
  width?: number
  height?: number
  margin?: { top: number; right: number; bottom: number; left: number }
  className?: string
}

export default function BarChart({ 
  data, 
  width = 400, 
  height = 300, 
  margin = { top: 20, right: 30, bottom: 40, left: 40 },
  className = ''
}: BarChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!data.length || !svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const chartWidth = width - margin.left - margin.right
    const chartHeight = height - margin.top - margin.bottom

    const x = d3.scaleBand()
      .domain(data.map(d => d.label))
      .range([0, chartWidth])
      .padding(0.1)

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value) || 0])
      .nice()
      .range([chartHeight, 0])

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Add bars
    g.selectAll('.bar')
      .data(data)
      .enter().append('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.label) || 0)
      .attr('width', x.bandwidth())
      .attr('y', d => y(d.value))
      .attr('height', d => chartHeight - y(d.value))
      .attr('fill', d => d.color || '#3b82f6')
      .attr('rx', 4)

    // Add x-axis
    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .style('font-size', '12px')
      .style('fill', '#6b7280')

    // Add y-axis
    g.append('g')
      .call(d3.axisLeft(y))
      .selectAll('text')
      .style('font-size', '12px')
      .style('fill', '#6b7280')

    // Add value labels on bars
    g.selectAll('.bar-label')
      .data(data)
      .enter().append('text')
      .attr('class', 'bar-label')
      .attr('x', d => (x(d.label) || 0) + x.bandwidth() / 2)
      .attr('y', d => y(d.value) - 5)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('fill', '#374151')
      .style('font-weight', '500')
      .text(d => d.value)

  }, [data, width, height, margin])

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className={className}
    />
  )
}
