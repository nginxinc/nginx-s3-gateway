<?xml version="1.0"?>
<xsl:stylesheet version="1.1" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:str="http://exslt.org/strings" extension-element-prefixes="str">
    <xsl:output method="html" encoding="utf-8" indent="yes"/>
    <xsl:strip-space elements="*" />

    <xsl:template match="/">
        <xsl:choose>
            <xsl:when test="//*[local-name()='Contents'] or //*[local-name()='CommonPrefixes']">
                <xsl:apply-templates select="*[local-name()='ListBucketResult']" />
            </xsl:when>
            <xsl:otherwise>
                <xsl:call-template name="no_contents"/>
            </xsl:otherwise>
        </xsl:choose>

    </xsl:template>

    <!-- When FOUR_O_FOUR_ON_EMPTY_BUCKET is disabled (the default setting),
         the following template will be executed when the bucket is empty. -->
    <xsl:template name="no_contents">
        <html>
            <head><title>No Files Available for Listing</title></head>
            <body>
                <h1>No Files Available for Listing</h1>
            </body>
        </html>
    </xsl:template>

    <xsl:template match="*[local-name()='ListBucketResult']">
        <xsl:text disable-output-escaping='yes'>&lt;!DOCTYPE html&gt;</xsl:text>
        <xsl:variable name="globalPrefix"
                      select="*[local-name()='Prefix']/text()"/>
        <html>
            <head>
                <title><xsl:value-of select="$globalPrefix"/>
                </title>
            </head>
            <body>
                <h1>Index of /<xsl:value-of select="$globalPrefix"/></h1>
                <hr/>
                <table id="list">
                    <thead>
                        <tr>
                            <th style="text-align: left; width:55%">Filename
                            </th>
                            <th style="text-align: left; width:20%">File Size
                            </th>
                            <th style="text-align: left; width:25%">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        <xsl:if test="string-length($globalPrefix) > 0">
                            <tr>
                                <td>
                                    <a href="../">..</a>
                                </td>
                            </tr>
                        </xsl:if>
                        <xsl:apply-templates
                                select="*[local-name()='CommonPrefixes']">
                            <xsl:with-param name="globalPrefix"
                                            select="$globalPrefix"/>
                        </xsl:apply-templates>
                        <xsl:apply-templates
                                select="*[local-name()='Contents']">
                            <xsl:with-param name="globalPrefix"
                                            select="$globalPrefix"/>
                        </xsl:apply-templates>
                    </tbody>
                </table>
            </body>
        </html>
    </xsl:template>
    <xsl:template match="*[local-name()='CommonPrefixes']">
        <xsl:param name="globalPrefix"/>
        <xsl:apply-templates select=".//*[local-name()='Prefix']">
            <xsl:with-param name="globalPrefix" select="$globalPrefix"/>
        </xsl:apply-templates>
    </xsl:template>
    <xsl:template match="*[local-name()='Prefix']">
        <xsl:param name="globalPrefix"/>
        <xsl:if test="not(text()=$globalPrefix)">
            <xsl:variable name="dirName"
                          select="substring-after(text(), $globalPrefix)"/>
            <tr>
                <td>
                    <a><xsl:attribute name="href">/<xsl:call-template name="encode-uri"><xsl:with-param name="uri" select="text()"/></xsl:call-template>/</xsl:attribute>
                        <xsl:value-of select="$dirName"/>
                    </a>
                </td>
                <td/>
                <td/>
            </tr>
        </xsl:if>
    </xsl:template>

    <xsl:template match="*[local-name()='Contents']">
        <xsl:param name="globalPrefix"/>
        <xsl:variable name="key" select="*[local-name()='Key']/text()"/>

        <xsl:if test="not($key=$globalPrefix)">
            <xsl:variable name="fileName"
                          select="substring-after($key, $globalPrefix)"/>
            <xsl:variable name="date"
                          select="*[local-name()='LastModified']/text()"/>
            <xsl:variable name="size" select="*[local-name()='Size']/text()"/>
            <tr>
                <td>
                    <a>
                        <xsl:attribute name="href">/<xsl:call-template name="encode-uri"><xsl:with-param name="uri" select="$key"/></xsl:call-template></xsl:attribute>
                        <xsl:value-of select="$fileName"/>
                    </a>
                </td>
                <td>
                    <xsl:value-of select="$size"/>
                </td>
                <td>
                    <xsl:value-of select="$date"/>
                </td>
            </tr>
        </xsl:if>
    </xsl:template>
    <!-- This template escapes the URI such that symbols or unicode characters are
         encoded so that they form a valid link that NGINX can parse -->
    <xsl:template name="encode-uri">
        <xsl:param name="uri"/>
        <xsl:for-each select="str:split($uri, '/')">
            <xsl:variable name="encoded" select="str:encode-uri(., 'true', 'UTF-8')" />
            <xsl:variable name="more-encoded" select="
                str:replace(
                    str:replace(
                        str:replace(
                            str:replace(
                                str:replace($encoded, '@', '%40'), '(', '%28'),
                        ')', '%29'),
                    '!', '%21'),
                '*', '%2A')" />
            <xsl:value-of select="$more-encoded" /><xsl:if test="position() != last()">/</xsl:if></xsl:for-each>
    </xsl:template>
</xsl:stylesheet>
